package com.integration.framework.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPubSub;

import java.util.List;
import java.util.concurrent.*;
import java.util.function.Predicate;

/**
 * Subscribes to a Redis Pub/Sub topic and collects
 * {@code IntegrationEvent} messages for assertion in tests.
 * <p>
 * Mirrors the TypeScript {@code createEventCollector()} helper.
 */
public final class EventCollector implements AutoCloseable {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final String host;
    private final int port;
    private final String topic;

    private final List<JsonNode> events = new CopyOnWriteArrayList<>();
    private final List<Waiter> waiters = new CopyOnWriteArrayList<>();

    private Jedis subscriber;
    private Thread subThread;

    public EventCollector(String host, int port, String topic) {
        this.host = host;
        this.port = port;
        this.topic = topic;
    }

    /** Start subscribing in a background thread. */
    public void start() {
        subscriber = new Jedis(host, port);
        subThread = new Thread(() -> subscriber.subscribe(new JedisPubSub() {
            @Override
            public void onMessage(String channel, String message) {
                try {
                    JsonNode event = MAPPER.readTree(message);
                    events.add(event);

                    // Wake any matching waiters
                    var it = waiters.iterator();
                    while (it.hasNext()) {
                        Waiter w = it.next();
                        if (w.filter.test(event)) {
                            w.future.complete(event);
                            it.remove();
                        }
                    }
                } catch (Exception e) {
                    // ignore parse errors in collector
                }
            }
        }, topic), "event-collector");
        subThread.setDaemon(true);
        subThread.start();
    }

    /**
     * Wait for an event matching the filter, or throw after timeout.
     *
     * @param filter    predicate applied to each incoming {@link JsonNode}
     * @param timeoutMs maximum wait time in milliseconds
     * @return the first matching event
     */
    public JsonNode waitForEvent(Predicate<JsonNode> filter, long timeoutMs)
            throws InterruptedException, ExecutionException, TimeoutException {
        // Check already-collected events first
        for (int i = 0; i < events.size(); i++) {
            if (filter.test(events.get(i))) {
                return events.remove(i);
            }
        }

        // Register a waiter for future events
        CompletableFuture<JsonNode> future = new CompletableFuture<>();
        Waiter waiter = new Waiter(filter, future);
        waiters.add(waiter);

        // Re-check events that may have arrived between scan and waiter registration
        for (int i = 0; i < events.size(); i++) {
            if (filter.test(events.get(i))) {
                waiters.remove(waiter);
                return events.remove(i);
            }
        }

        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            waiters.remove(waiter);
            throw new TimeoutException(
                    "Timed out after " + timeoutMs + "ms waiting for matching event. " +
                    "Collected " + events.size() + " events.");
        }
    }

    /** Convenience overload with 15 s default timeout. */
    public JsonNode waitForEvent(Predicate<JsonNode> filter)
            throws InterruptedException, ExecutionException, TimeoutException {
        return waitForEvent(filter, 15_000);
    }

    public List<JsonNode> getAll() {
        return List.copyOf(events);
    }

    @Override
    public void close() {
        if (subscriber != null) {
            try {
                subscriber.close();
            } catch (Exception ignored) { }
        }
        if (subThread != null) {
            subThread.interrupt();
        }
    }

    // ── Internal ────────────────────────────────────────────────

    private record Waiter(Predicate<JsonNode> filter, CompletableFuture<JsonNode> future) { }
}
