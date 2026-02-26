package com.integration.tests.e2e;

import com.integration.framework.api.ApiClient;
import com.integration.framework.utils.EventCollector;
import com.integration.framework.utils.WaitUtils;
import com.integration.tests.base.BaseTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-End Tests – Full Pipeline Verification
 *
 * Verifies the complete integration flows:
 *
 *   App POST /api/send
 *   → API Gateway (Nginx) → SOAP Processor → SQS (ElasticMQ)
 *   → Event Publisher → Redis Pub/Sub
 *   → Event arrives with correct payload
 *
 * Tests are organized into three groups:
 * 1. core-app-1 pipeline (PlannedOutage messages)
 * 2. siebel pipeline (ServiceRequest / AccountUpdate messages)
 * 3. Cross-app round trip (both apps interacting concurrently)
 */
@Tag("e2e")
@DisplayName("E2E: Full Pipeline")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FullPipelineTest extends BaseTest {

    private static EventCollector collector;

    @BeforeAll
    static void setup() {
        // Ensure all services are healthy
        WaitUtils.waitForService(coreApp1Url(), "core-app-1");
        WaitUtils.waitForService(siebelUrl(), "siebel");

        // Subscribe to Redis Pub/Sub events
        collector = new EventCollector(
                config.redisHost(), config.redisPort(), config.pubsubTopic());
        collector.start();
        WaitUtils.sleep(500);
    }

    @AfterAll
    static void teardown() {
        if (collector != null) collector.close();
    }

    // ─────────────────────────────────────────────────────────────
    // core-app-1 pipeline
    // ─────────────────────────────────────────────────────────────

    @Test
    @Order(1)
    @DisplayName("PlannedOutage message flows through the full pipeline and arrives as an event")
    void coreApp1PlannedOutageFullPipeline() throws Exception {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "system", "E2E-Test-System",
                    "region", "E2E-REGION",
                    "severity", "HIGH",
                    "description", "E2E test outage notification"
            ));

            assertThat(body.get("success").asBoolean()).isTrue();
            String outageId = body.at("/outage/outageId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> outageId.equals(e.at("/detail/requestId").asText()), 15_000);

            assertThat(event.get("eventType").asText()).isEqualTo("IntegrationEvent");
            assertThat(event.get("source").asText()).isEqualTo("event-publisher");
            assertThat(event.at("/detail/requestId").asText()).isEqualTo(outageId);
            assertThat(event.at("/detail/originalSource").asText()).isEqualTo("soap-processor");
            assertThat(event.at("/detail/status").asText()).isEqualTo("PROCESSED");

            JsonNode payload = event.at("/detail/processedPayload");
            assertThat(payload.get("Action").asText()).isEqualTo("PlannedOutage");
            assertThat(payload.get("System").asText()).isEqualTo("E2E-Test-System");
            assertThat(payload.get("Region").asText()).isEqualTo("E2E-REGION");
            assertThat(payload.get("Severity").asText()).isEqualTo("HIGH");
            assertThat(payload.get("Description").asText()).isEqualTo("E2E test outage notification");
        }
    }

    @Test
    @Order(2)
    @DisplayName("default outage parameters are preserved through the pipeline")
    void coreApp1DefaultParameters() throws Exception {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());
            String outageId = body.at("/outage/outageId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> outageId.equals(e.at("/detail/requestId").asText()), 15_000);

            JsonNode payload = event.at("/detail/processedPayload");
            assertThat(payload.get("Action").asText()).isEqualTo("PlannedOutage");
            assertThat(payload.get("System").asText()).isEqualTo("Siebel CRM");
            assertThat(payload.get("Region").asText()).isEqualTo("US-WEST-2");
            assertThat(payload.get("Severity").asText()).isEqualTo("MEDIUM");
        }
    }

    @Test
    @Order(3)
    @DisplayName("multiple outage notifications produce distinct events")
    void coreApp1MultipleOutages() throws Exception {
        List<String> systems = new ArrayList<>();

        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            for (int i = 0; i < 3; i++) {
                String system = "E2E-Multi-" + i;
                api.postJsonParsed("/api/send", Map.of(
                        "system", system,
                        "severity", "LOW"
                ));
                systems.add(system);
                WaitUtils.sleep(200);
            }
        }

        // Match by unique system name (outageIds are timestamp-based per-second and may collide)
        for (String system : systems) {
            JsonNode event = collector.waitForEvent(
                    e -> system.equals(e.at("/detail/processedPayload/System").asText()), 15_000);
            assertThat(event.at("/detail/processedPayload/System").asText()).isEqualTo(system);
            assertThat(event.at("/detail/status").asText()).isEqualTo("PROCESSED");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // siebel pipeline
    // ─────────────────────────────────────────────────────────────

    @Test
    @Order(4)
    @DisplayName("ServiceRequest message flows through the full pipeline")
    void siebelServiceRequestFullPipeline() throws Exception {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "type", "ServiceRequest",
                    "account", "ACC-E2E-001",
                    "contact", "E2E Test User",
                    "service", "E2E Test Service",
                    "priority", "HIGH",
                    "description", "End-to-end pipeline verification"
            ));

            assertThat(body.get("success").asBoolean()).isTrue();
            String requestId = body.at("/message/requestId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> requestId.equals(e.at("/detail/requestId").asText()), 15_000);

            assertThat(event.get("eventType").asText()).isEqualTo("IntegrationEvent");
            assertThat(event.at("/detail/requestId").asText()).isEqualTo(requestId);
            assertThat(event.at("/detail/status").asText()).isEqualTo("PROCESSED");

            JsonNode payload = event.at("/detail/processedPayload");
            assertThat(payload.get("Action").asText()).isEqualTo("ServiceRequest");
            assertThat(payload.get("AccountId").asText()).isEqualTo("ACC-E2E-001");
            assertThat(payload.get("ContactName").asText()).isEqualTo("E2E Test User");
            assertThat(payload.get("ServiceType").asText()).isEqualTo("E2E Test Service");
            assertThat(payload.get("Priority").asText()).isEqualTo("HIGH");
            assertThat(payload.get("Source").asText()).isEqualTo("Siebel CRM");
        }
    }

    @Test
    @Order(5)
    @DisplayName("AccountUpdate message flows through the full pipeline")
    void siebelAccountUpdateFullPipeline() throws Exception {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "type", "AccountUpdate",
                    "account", "ACC-E2E-UPDATE",
                    "contact", "Jane Doe",
                    "priority", "URGENT"
            ));

            String requestId = body.at("/message/requestId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> requestId.equals(e.at("/detail/requestId").asText()), 15_000);

            JsonNode payload = event.at("/detail/processedPayload");
            assertThat(payload.get("Action").asText()).isEqualTo("AccountUpdate");
            assertThat(payload.get("AccountId").asText()).isEqualTo("ACC-E2E-UPDATE");
            assertThat(payload.get("ContactName").asText()).isEqualTo("Jane Doe");
            assertThat(payload.get("Priority").asText()).isEqualTo("URGENT");
        }
    }

    @Test
    @Order(6)
    @DisplayName("default siebel parameters produce correct event payload")
    void siebelDefaultParameters() throws Exception {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());
            String requestId = body.at("/message/requestId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> requestId.equals(e.at("/detail/requestId").asText()), 15_000);

            JsonNode payload = event.at("/detail/processedPayload");
            assertThat(payload.get("Action").asText()).isEqualTo("ServiceRequest");
            assertThat(payload.get("AccountId").asText()).isEqualTo("ACC-2048");
            assertThat(payload.get("ContactName").asText()).isEqualTo("John Doe");
            assertThat(payload.get("Priority").asText()).isEqualTo("NORMAL");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Cross-app round trip
    // ─────────────────────────────────────────────────────────────

    @Test
    @Order(7)
    @DisplayName("core-app-1 outage notification reaches the event bus")
    void crossAppCoreApp1() throws Exception {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "system", "CrossApp-Test",
                    "severity", "CRITICAL"
            ));
            String outageId = body.at("/outage/outageId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> outageId.equals(e.at("/detail/requestId").asText()), 15_000);

            assertThat(event.at("/detail/processedPayload/Action").asText()).isEqualTo("PlannedOutage");
            assertThat(event.at("/detail/processedPayload/System").asText()).isEqualTo("CrossApp-Test");
            assertThat(event.at("/detail/processedPayload/Severity").asText()).isEqualTo("CRITICAL");
        }
    }

    @Test
    @Order(8)
    @DisplayName("siebel service request reaches the event bus")
    void crossAppSiebel() throws Exception {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "type", "AccountUpdate",
                    "account", "ACC-CROSSAPP",
                    "priority", "HIGH"
            ));
            String requestId = body.at("/message/requestId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> requestId.equals(e.at("/detail/requestId").asText()), 15_000);

            assertThat(event.at("/detail/processedPayload/Action").asText()).isEqualTo("AccountUpdate");
            assertThat(event.at("/detail/processedPayload/AccountId").asText()).isEqualTo("ACC-CROSSAPP");
        }
    }

    @Test
    @Order(9)
    @DisplayName("events contain consistent timestamps and metadata")
    void consistentTimestampsAndMetadata() throws Exception {
        String beforeSend = java.time.Instant.now().toString();

        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "system", "Timestamp-Test"
            ));
            String outageId = body.at("/outage/outageId").asText();

            JsonNode event = collector.waitForEvent(
                    e -> outageId.equals(e.at("/detail/requestId").asText()), 15_000);

            assertThat(event.get("eventType").asText()).isEqualTo("IntegrationEvent");
            assertThat(event.get("source").asText()).isEqualTo("event-publisher");
            assertThat(event.has("timestamp")).isTrue();
            assertThat(event.at("/detail/originalSource").asText()).isEqualTo("soap-processor");
            assertThat(event.at("/detail/status").asText()).isEqualTo("PROCESSED");

            long eventTime = java.time.Instant.parse(event.get("timestamp").asText()).toEpochMilli();
            long beforeTime = java.time.Instant.parse(beforeSend).toEpochMilli();
            assertThat(eventTime).isGreaterThanOrEqualTo(beforeTime);
        }
    }
}
