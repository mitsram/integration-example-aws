package com.integration.tests.integration;

import com.integration.framework.api.ApiClient;
import com.integration.tests.base.BaseTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * System Integration Tests – core-app-1 API
 *
 * Verifies that core-app-1's POST /api/send endpoint correctly
 * sends SOAP messages through the API Gateway and receives
 * a successful response from the integration layer.
 */
@Tag("integration")
@DisplayName("core-app-1 – POST /api/send")
class CoreApp1Test extends BaseTest {

    @Test
    @DisplayName("sends a default planned outage notification")
    void defaultOutageNotification() {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());

            assertThat(body.get("success").asBoolean()).isTrue();
            assertThat(body.has("outage")).isTrue();
            assertThat(body.at("/outage/outageId").asText()).startsWith("OUTAGE-");
            assertThat(body.at("/outage/system").asText()).isEqualTo("Siebel CRM");
            assertThat(body.at("/outage/severity").asText()).isEqualTo("MEDIUM");
            assertThat(body.at("/integrationResponse/status").asInt()).isEqualTo(202);
        }
    }

    @Test
    @DisplayName("sends a custom planned outage notification with parameters")
    void customOutageNotification() {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "system", "Billing System",
                    "region", "EU-WEST-1",
                    "severity", "CRITICAL",
                    "description", "Emergency patch deployment"
            ));

            assertThat(body.get("success").asBoolean()).isTrue();
            assertThat(body.at("/outage/system").asText()).isEqualTo("Billing System");
            assertThat(body.at("/outage/region").asText()).isEqualTo("EU-WEST-1");
            assertThat(body.at("/outage/severity").asText()).isEqualTo("CRITICAL");
            assertThat(body.at("/outage/description").asText()).isEqualTo("Emergency patch deployment");
            assertThat(body.at("/integrationResponse/status").asInt()).isEqualTo(202);
        }
    }

    @Test
    @DisplayName("SOAP response contains the correct request ID")
    void soapResponseContainsRequestId() {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());

            String soapResponse = body.at("/integrationResponse/body").asText();
            String outageId = body.at("/outage/outageId").asText();

            assertThat(soapResponse).contains("<res:RequestId>" + outageId + "</res:RequestId>");
            assertThat(soapResponse).contains("<res:Status>Accepted</res:Status>");
            assertThat(soapResponse).contains("Message queued successfully");
        }
    }

    @Test
    @DisplayName("outage notification has valid scheduled times")
    void validScheduledTimes() {
        long before = System.currentTimeMillis();

        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());

            long start = java.time.Instant.parse(body.at("/outage/scheduledStart").asText()).toEpochMilli();
            long end = java.time.Instant.parse(body.at("/outage/scheduledEnd").asText()).toEpochMilli();

            // Start should be ~2 hours from now, end ~4 hours
            assertThat(start).isGreaterThan(before);
            assertThat(end).isGreaterThan(start);
            // End - Start should be ~2 hours (7_200_000 ms ± 5s tolerance)
            assertThat(end - start).isBetween(7_195_000L, 7_205_000L);
        }
    }
}
