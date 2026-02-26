package com.integration.tests.integration;

import com.integration.framework.api.ApiClient;
import com.integration.framework.api.SoapClient;
import com.integration.framework.api.SoapClient.SoapResponse;
import com.integration.tests.base.BaseTest;
import org.junit.jupiter.api.*;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * System Integration Tests – API Gateway Routing
 *
 * Verifies that the API Gateway (Nginx) correctly proxies
 * SOAP requests to the soap-processor and returns proper responses.
 */
@Tag("integration")
@DisplayName("API Gateway – SOAP Routing")
class ApiGatewayTest extends BaseTest {

    private static final String VALID_SOAP = """
            <?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:req="http://example.com/integration/request">
              <soapenv:Header/>
              <soapenv:Body>
                <req:ProcessRequest>
                  <req:RequestId>TEST-GATEWAY-001</req:RequestId>
                  <req:Action>TestAction</req:Action>
                  <req:Description>API Gateway routing test</req:Description>
                </req:ProcessRequest>
              </soapenv:Body>
            </soapenv:Envelope>""";

    @Test
    @DisplayName("proxies a valid SOAP request and returns HTTP 202")
    void validSoapReturns202() {
        try (SoapClient soap = new SoapClient(apiGatewayUrl())) {
            SoapResponse res = soap.send(VALID_SOAP);

            assertThat(res.status()).isEqualTo(202);
            assertThat(res.body()).contains("<res:Status>Accepted</res:Status>");
            assertThat(res.body()).contains("TEST-GATEWAY-001");
        }
    }

    @Test
    @DisplayName("returns a SOAP error for invalid XML")
    void invalidXmlReturns400() {
        try (SoapClient soap = new SoapClient(apiGatewayUrl())) {
            SoapResponse res = soap.send("this is not xml");

            assertThat(res.status()).isEqualTo(400);
            assertThat(res.body()).contains("Missing SOAP Body");
        }
    }

    @Test
    @DisplayName("returns a SOAP error for XML without SOAP envelope")
    void missingEnvelopeReturns400() {
        try (SoapClient soap = new SoapClient(apiGatewayUrl())) {
            SoapResponse res = soap.send(
                    "<?xml version=\"1.0\"?><root><data>test</data></root>");

            assertThat(res.status()).isEqualTo(400);
            assertThat(res.body()).contains("Missing SOAP Body");
        }
    }

    @Test
    @DisplayName("generates unique RequestIds in responses for consecutive requests")
    void uniqueRequestIds() {
        Pattern idPattern = Pattern.compile("<res:RequestId>(.+?)</res:RequestId>");
        Set<String> ids = new HashSet<>();

        try (SoapClient soap = new SoapClient(apiGatewayUrl())) {
            for (int i = 0; i < 3; i++) {
                String body = VALID_SOAP.replace(
                        "TEST-GATEWAY-001",
                        "TEST-UNIQUE-" + System.currentTimeMillis() + "-" + i);
                SoapResponse res = soap.send(body);
                Matcher m = idPattern.matcher(res.body());
                if (m.find()) ids.add(m.group(1));
            }
        }

        assertThat(ids).hasSize(3);
    }
}
