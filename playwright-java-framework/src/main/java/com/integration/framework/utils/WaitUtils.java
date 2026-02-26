package com.integration.framework.utils;

import java.net.HttpURLConnection;
import java.net.URI;

/**
 * Retry and wait utilities for test setup.
 */
public final class WaitUtils {

    private WaitUtils() { }

    /**
     * Poll a service's /health endpoint until it returns HTTP 2xx.
     *
     * @param baseUrl    e.g. {@code http://localhost:3001}
     * @param name       human-readable name for error messages
     * @param maxRetries number of attempts before failing
     * @param delayMs    pause between attempts
     */
    public static void waitForService(String baseUrl, String name,
                                      int maxRetries, int delayMs) {
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpURLConnection conn =
                        (HttpURLConnection) URI.create(baseUrl + "/health").toURL().openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(2000);
                int code = conn.getResponseCode();
                conn.disconnect();
                if (code >= 200 && code < 300) return;
            } catch (Exception ignored) { }

            sleep(delayMs);
        }
        throw new RuntimeException(
                "Service '" + name + "' at " + baseUrl +
                " not healthy after " + maxRetries + " retries");
    }

    public static void waitForService(String baseUrl, String name) {
        waitForService(baseUrl, name, 10, 1000);
    }

    public static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
