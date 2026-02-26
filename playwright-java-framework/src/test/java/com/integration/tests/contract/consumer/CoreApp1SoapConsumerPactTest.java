package com.integration.tests.contract.consumer;

import au.com.dius.pact.consumer.MockServer;
import au.com.dius.pact.consumer.dsl.PactDslWithProvider;
import au.com.dius.pact.consumer.junit5.PactConsumerTestExt;
import au.com.dius.pact.consumer.junit5.PactTestFor;
import au.com.dius.pact.core.model.V4Pact;
import au.com.dius.pact.core.model.annotations.Pact;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Consumer Contract Test – core-app-1 → integration-layer
 *
 * Defines what SOAP requests core-app-1 sends to the integration layer
 * and what responses it expects back.
 *
 * The contract verifies:
 *   - The exact SOAP XML structure core-app-1 sends
 *   - Expected HTTP status codes (202 for valid, 400 for invalid)
 *   - Response Content-Type is text/xml
 *
 * ✅ Runs standalone — no Docker stack or live services needed.
 */
@Tag("contract")
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "integration-layer")
@DisplayName("Contract: core-app-1 → integration-layer")
class CoreApp1SoapConsumerPactTest {

    private static final String PLANNED_OUTAGE_SOAP = """
            <?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:req="http://example.com/integration/request">
              <soapenv:Header/>
              <soapenv:Body>
                <req:ProcessRequest>
                  <req:RequestId>OUTAGE-20260101120000</req:RequestId>
                  <req:Action>PlannedOutage</req:Action>
                  <req:System>Siebel CRM</req:System>
                  <req:Region>US-WEST-2</req:Region>
                  <req:ScheduledStart>2026-01-01T14:00:00.000Z</req:ScheduledStart>
                  <req:ScheduledEnd>2026-01-01T16:00:00.000Z</req:ScheduledEnd>
                  <req:Severity>MEDIUM</req:Severity>
                  <req:Description>Planned maintenance window</req:Description>
                </req:ProcessRequest>
              </soapenv:Body>
            </soapenv:Envelope>""";

    private static final String XML_WITHOUT_BODY =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><root><data>no soap here</data></root>";

    @Pact(consumer = "core-app-1")
    V4Pact plannedOutagePact(PactDslWithProvider builder) {
        return builder
                .given("the integration layer is available")
                .uponReceiving("a PlannedOutage SOAP request from core-app-1")
                .path("/soap")
                .method("POST")
                .headers("Content-Type", "text/xml; charset=utf-8")
                .body(PLANNED_OUTAGE_SOAP, "text/xml; charset=utf-8")
                .willRespondWith()
                .status(202)
                .headers(java.util.Map.of("Content-Type", "text/xml; charset=utf-8"))
                .toPact(V4Pact.class);
    }

    @Pact(consumer = "core-app-1")
    V4Pact invalidXmlPact(PactDslWithProvider builder) {
        return builder
                .given("the integration layer is available")
                .uponReceiving("an XML request without SOAP Body from core-app-1")
                .path("/soap")
                .method("POST")
                .headers("Content-Type", "text/xml; charset=utf-8")
                .body(XML_WITHOUT_BODY, "text/xml; charset=utf-8")
                .willRespondWith()
                .status(400)
                .headers(java.util.Map.of("Content-Type", "text/xml; charset=utf-8"))
                .toPact(V4Pact.class);
    }

    @Test
    @PactTestFor(pactMethod = "plannedOutagePact")
    @DisplayName("sends a PlannedOutage SOAP request and receives 202 Accepted")
    void plannedOutage(MockServer mockServer) throws IOException, InterruptedException {
        HttpResponse<String> response = sendSoap(mockServer, PLANNED_OUTAGE_SOAP);
        assertThat(response.statusCode()).isEqualTo(202);
    }

    @Test
    @PactTestFor(pactMethod = "invalidXmlPact")
    @DisplayName("receives a 400 for XML missing SOAP Body")
    void invalidXml(MockServer mockServer) throws IOException, InterruptedException {
        HttpResponse<String> response = sendSoap(mockServer, XML_WITHOUT_BODY);
        assertThat(response.statusCode()).isEqualTo(400);
    }

    private HttpResponse<String> sendSoap(MockServer mockServer, String body)
            throws IOException, InterruptedException {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(mockServer.getUrl() + "/soap"))
                .header("Content-Type", "text/xml; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
