package com.integration.tests.contract.consumer;

import au.com.dius.pact.consumer.MessagePactBuilder;
import au.com.dius.pact.consumer.junit5.PactConsumerTestExt;
import au.com.dius.pact.consumer.junit5.PactTestFor;
import au.com.dius.pact.consumer.junit5.ProviderType;
import au.com.dius.pact.core.model.V4Interaction;
import au.com.dius.pact.core.model.V4Pact;
import au.com.dius.pact.core.model.annotations.Pact;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.List;
import java.util.Map;

import static au.com.dius.pact.consumer.dsl.LambdaDsl.newJsonBody;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Consumer Message Contract Test – siebel ← integration-layer events
 *
 * Defines the IntegrationEvent message structure that siebel's
 * event-listener expects to receive from Redis Pub/Sub.
 *
 * ✅ Runs standalone — no Docker stack, Redis, or live services needed.
 */
@Tag("contract")
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "integration-layer-events", providerType = ProviderType.ASYNCH)
@DisplayName("Contract: siebel ← IntegrationEvent")
class SiebelEventConsumerPactTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Pact(consumer = "siebel", provider = "integration-layer-events")
    V4Pact processedEventPact(MessagePactBuilder builder) {
        return builder
                .expectsToReceive("an IntegrationEvent with status PROCESSED")
                .withContent(newJsonBody(body -> {
                    body.stringType("eventType", "IntegrationEvent");
                    body.stringType("source", "event-publisher");
                    body.stringType("timestamp", "2026-01-01T12:00:00.000Z");
                    body.object("detail", detail -> {
                        detail.stringType("requestId", "SBL-20260101120000");
                        detail.stringType("originalSource", "soap-processor");
                        detail.stringType("originalTimestamp", "2026-01-01T11:59:00.000Z");
                        detail.object("processedPayload", payload -> {
                            payload.stringType("Action", "ServiceRequest");
                            payload.stringType("AccountId", "ACC-2048");
                        });
                        detail.stringType("status", "PROCESSED");
                    });
                }).build())
                .toPact(V4Pact.class);
    }

    @Pact(consumer = "siebel", provider = "integration-layer-events")
    V4Pact minimalEventPact(MessagePactBuilder builder) {
        return builder
                .expectsToReceive("an IntegrationEvent with minimal payload")
                .withContent(newJsonBody(body -> {
                    body.stringType("eventType", "IntegrationEvent");
                    body.stringType("source", "event-publisher");
                    body.stringType("timestamp", "2026-01-01T12:00:00.000Z");
                    body.object("detail", detail -> {
                        detail.object("processedPayload", payload -> { });
                        detail.stringType("status", "PROCESSED");
                    });
                }).build())
                .toPact(V4Pact.class);
    }

    @Test
    @PactTestFor(pactMethod = "processedEventPact")
    @DisplayName("can process a PROCESSED IntegrationEvent")
    void processedEvent(List<V4Interaction.AsynchronousMessage> messages) throws Exception {
        assertThat(messages).hasSize(1);

        byte[] content = messages.get(0).getContents().getContents().getValue();
        JsonNode event = MAPPER.readTree(content);

        assertThat(event.get("eventType").asText()).isEqualTo("IntegrationEvent");
        assertThat(event.get("source").asText()).isEqualTo("event-publisher");
        assertThat(event.has("timestamp")).isTrue();
        assertThat(event.has("detail")).isTrue();
        assertThat(event.at("/detail/requestId").asText()).isNotEmpty();
        assertThat(event.at("/detail/originalSource").asText()).isNotEmpty();
        assertThat(event.at("/detail/processedPayload")).isNotNull();
        assertThat(event.at("/detail/status").asText()).matches("PROCESSED|FAILED");
    }

    @Test
    @PactTestFor(pactMethod = "minimalEventPact")
    @DisplayName("can process an IntegrationEvent with minimal payload")
    void minimalEvent(List<V4Interaction.AsynchronousMessage> messages) throws Exception {
        assertThat(messages).hasSize(1);

        byte[] content = messages.get(0).getContents().getContents().getValue();
        JsonNode event = MAPPER.readTree(content);

        assertThat(event.has("eventType")).isTrue();
        assertThat(event.has("detail")).isTrue();
        assertThat(event.at("/detail/processedPayload")).isNotNull();
        assertThat(event.at("/detail/status").asText()).isNotEmpty();
    }
}
