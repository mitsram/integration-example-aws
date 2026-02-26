package com.integration.tests.cucumber.steps;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.integration.framework.api.ApiClient;
import com.integration.framework.api.SoapClient;
import com.integration.framework.api.SoapClient.SoapResponse;
import com.integration.framework.config.TestConfig;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.en.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cucumber step definitions for integration scenarios.
 * <p>
 * These steps demonstrate how the framework extends to BDD.
 * Add more step definition classes as scenarios grow.
 */
public class IntegrationSteps {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestConfig config;
    private SoapClient soapClient;
    private ApiClient apiClient;

    private SoapResponse lastSoapResponse;
    private JsonNode lastJsonResponse;
    private int lastStatus;

    @Before
    public void setup() {
        config = TestConfig.load();
    }

    @After
    public void teardown() {
        if (soapClient != null) soapClient.close();
        if (apiClient != null) apiClient.close();
    }

    // ── Given ───────────────────────────────────────────────────

    @Given("the integration layer is running")
    public void integrationLayerIsRunning() {
        soapClient = new SoapClient(config.apiGatewayUrl());
    }

    @Given("core-app-1 is running")
    public void coreApp1IsRunning() {
        apiClient = ApiClient.create(config.coreApp1Url());
    }

    @Given("siebel is running")
    public void siebelIsRunning() {
        apiClient = ApiClient.create(config.siebelUrl());
    }

    // ── When ────────────────────────────────────────────────────

    @When("I send a valid SOAP request to the API Gateway")
    public void sendValidSoapRequest() {
        String soap = """
                <?xml version="1.0" encoding="UTF-8"?>
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                                  xmlns:req="http://example.com/integration/request">
                  <soapenv:Header/>
                  <soapenv:Body>
                    <req:ProcessRequest>
                      <req:RequestId>BDD-TEST-001</req:RequestId>
                      <req:Action>TestAction</req:Action>
                      <req:Description>Cucumber BDD test</req:Description>
                    </req:ProcessRequest>
                  </soapenv:Body>
                </soapenv:Envelope>""";
        lastSoapResponse = soapClient.send(soap);
    }

    @When("I send invalid XML to the API Gateway")
    public void sendInvalidXml() {
        lastSoapResponse = soapClient.send("this is not xml");
    }

    @When("I send a planned outage notification")
    public void sendPlannedOutage() {
        lastJsonResponse = apiClient.postJsonParsed("/api/send", Map.of());
        lastStatus = 200; // postJsonParsed already parsed the successful response
    }

    @When("I send a service request with type {string}")
    public void sendServiceRequest(String type) {
        lastJsonResponse = apiClient.postJsonParsed("/api/send", Map.of("type", type));
    }

    // ── Then ────────────────────────────────────────────────────

    @Then("the response status should be {int}")
    public void responseStatusShouldBe(int expectedStatus) {
        if (lastSoapResponse != null) {
            assertThat(lastSoapResponse.status()).isEqualTo(expectedStatus);
        }
    }

    @Then("the response should contain {string}")
    public void responseShouldContain(String expectedText) {
        if (lastSoapResponse != null) {
            assertThat(lastSoapResponse.body()).contains(expectedText);
        }
    }

    @Then("the API response should indicate success")
    public void apiResponseSuccess() {
        assertThat(lastJsonResponse.get("success").asBoolean()).isTrue();
    }

    @Then("the outage ID should start with {string}")
    public void outageIdPrefix(String prefix) {
        assertThat(lastJsonResponse.at("/outage/outageId").asText()).startsWith(prefix);
    }

    @Then("the message action should be {string}")
    public void messageAction(String action) {
        assertThat(lastJsonResponse.at("/message/action").asText()).isEqualTo(action);
    }
}
