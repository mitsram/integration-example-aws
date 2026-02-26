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
 * Consumer Contract Test – siebel → integration-layer
 *
 * Defines what SOAP requests siebel sends to the integration layer
 * and what responses it expects back. Covers both ServiceRequest
 * and AccountUpdate message types.
 *
 * ✅ Runs standalone — no Docker stack or live services needed.
 */
@Tag("contract")
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "integration-layer")
@DisplayName("Contract: siebel → integration-layer")
class SiebelSoapConsumerPactTest {

    private static final String SERVICE_REQUEST_SOAP = """
            <?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:req="http://example.com/integration/request">
              <soapenv:Header/>
              <soapenv:Body>
                <req:ProcessRequest>
                  <req:RequestId>SBL-20260101120000</req:RequestId>
                  <req:Action>ServiceRequest</req:Action>
                  <req:AccountId>ACC-2048</req:AccountId>
                  <req:ContactName>John Doe</req:ContactName>
                  <req:ServiceType>Billing Inquiry</req:ServiceType>
                  <req:Priority>NORMAL</req:Priority>
                  <req:Description>Customer requesting invoice correction</req:Description>
                  <req:Source>Siebel CRM</req:Source>
                </req:ProcessRequest>
              </soapenv:Body>
            </soapenv:Envelope>""";

    private static final String ACCOUNT_UPDATE_SOAP = """
            <?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:req="http://example.com/integration/request">
              <soapenv:Header/>
              <soapenv:Body>
                <req:ProcessRequest>
                  <req:RequestId>SBL-20260101120001</req:RequestId>
                  <req:Action>AccountUpdate</req:Action>
                  <req:AccountId>ACC-5555</req:AccountId>
                  <req:ContactName>Jane Smith</req:ContactName>
                  <req:ServiceType>Premium Support</req:ServiceType>
                  <req:Priority>URGENT</req:Priority>
                  <req:Description>VIP account escalation</req:Description>
                  <req:Source>Siebel CRM</req:Source>
                </req:ProcessRequest>
              </soapenv:Body>
            </soapenv:Envelope>""";

    @Pact(consumer = "siebel")
    V4Pact serviceRequestPact(PactDslWithProvider builder) {
        return builder
                .given("the integration layer is available")
                .uponReceiving("a ServiceRequest SOAP request from siebel")
                .path("/soap")
                .method("POST")
                .headers("Content-Type", "text/xml; charset=utf-8")
                .body(SERVICE_REQUEST_SOAP, "text/xml; charset=utf-8")
                .willRespondWith()
                .status(202)
                .headers(java.util.Map.of("Content-Type", "text/xml; charset=utf-8"))
                .toPact(V4Pact.class);
    }

    @Pact(consumer = "siebel")
    V4Pact accountUpdatePact(PactDslWithProvider builder) {
        return builder
                .given("the integration layer is available")
                .uponReceiving("an AccountUpdate SOAP request from siebel")
                .path("/soap")
                .method("POST")
                .headers("Content-Type", "text/xml; charset=utf-8")
                .body(ACCOUNT_UPDATE_SOAP, "text/xml; charset=utf-8")
                .willRespondWith()
                .status(202)
                .headers(java.util.Map.of("Content-Type", "text/xml; charset=utf-8"))
                .toPact(V4Pact.class);
    }

    @Test
    @PactTestFor(pactMethod = "serviceRequestPact")
    @DisplayName("sends a ServiceRequest SOAP message and receives 202 Accepted")
    void serviceRequest(MockServer mockServer) throws IOException, InterruptedException {
        HttpResponse<String> response = sendSoap(mockServer, SERVICE_REQUEST_SOAP);
        assertThat(response.statusCode()).isEqualTo(202);
    }

    @Test
    @PactTestFor(pactMethod = "accountUpdatePact")
    @DisplayName("sends an AccountUpdate SOAP message and receives 202 Accepted")
    void accountUpdate(MockServer mockServer) throws IOException, InterruptedException {
        HttpResponse<String> response = sendSoap(mockServer, ACCOUNT_UPDATE_SOAP);
        assertThat(response.statusCode()).isEqualTo(202);
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
