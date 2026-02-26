package com.integration.tests.integration;

import com.integration.framework.api.ApiClient;
import com.integration.tests.base.BaseTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * System Integration Tests – Siebel API
 *
 * Verifies that siebel's POST /api/send endpoint correctly
 * sends SOAP messages through the API Gateway and receives
 * a successful response from the integration layer.
 */
@Tag("integration")
@DisplayName("siebel – POST /api/send")
class SiebelTest extends BaseTest {

    @Test
    @DisplayName("sends a default service request")
    void defaultServiceRequest() {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());

            assertThat(body.get("success").asBoolean()).isTrue();
            assertThat(body.has("message")).isTrue();
            assertThat(body.at("/message/requestId").asText()).startsWith("SBL-");
            assertThat(body.at("/message/action").asText()).isEqualTo("ServiceRequest");
            assertThat(body.at("/message/accountId").asText()).isEqualTo("ACC-2048");
            assertThat(body.at("/message/priority").asText()).isEqualTo("NORMAL");
            assertThat(body.at("/integrationResponse/status").asInt()).isEqualTo(202);
        }
    }

    @Test
    @DisplayName("sends a custom SOAP message with all parameters")
    void customSoapMessage() {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of(
                    "type", "AccountUpdate",
                    "account", "ACC-5555",
                    "contact", "Jane Smith",
                    "service", "Premium Support",
                    "priority", "URGENT",
                    "description", "VIP account escalation"
            ));

            assertThat(body.get("success").asBoolean()).isTrue();
            assertThat(body.at("/message/action").asText()).isEqualTo("AccountUpdate");
            assertThat(body.at("/message/accountId").asText()).isEqualTo("ACC-5555");
            assertThat(body.at("/message/contactName").asText()).isEqualTo("Jane Smith");
            assertThat(body.at("/message/serviceType").asText()).isEqualTo("Premium Support");
            assertThat(body.at("/message/priority").asText()).isEqualTo("URGENT");
            assertThat(body.at("/message/description").asText()).isEqualTo("VIP account escalation");
        }
    }

    @Test
    @DisplayName("SOAP response contains the correct request ID")
    void soapResponseContainsRequestId() {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.postJsonParsed("/api/send", Map.of());

            String soapResponse = body.at("/integrationResponse/body").asText();
            String requestId = body.at("/message/requestId").asText();

            assertThat(soapResponse).contains("<res:RequestId>" + requestId + "</res:RequestId>");
            assertThat(soapResponse).contains("<res:Status>Accepted</res:Status>");
        }
    }

    @Test
    @DisplayName("handles different message types")
    void differentMessageTypes() {
        List<String> types = List.of("ServiceRequest", "AccountUpdate", "ContactChange", "BillingInquiry");

        try (ApiClient api = ApiClient.create(siebelUrl())) {
            for (String type : types) {
                JsonNode body = api.postJsonParsed("/api/send", Map.of("type", type));
                assertThat(body.get("success").asBoolean()).isTrue();
                assertThat(body.at("/message/action").asText()).isEqualTo(type);
            }
        }
    }
}
