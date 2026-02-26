@integration
Feature: API Gateway SOAP Routing
  The API Gateway should correctly proxy SOAP requests to the
  soap-processor and return appropriate responses.

  Background:
    Given the integration layer is running

  Scenario: Valid SOAP request returns 202 Accepted
    When I send a valid SOAP request to the API Gateway
    Then the response status should be 202
    And the response should contain "<res:Status>Accepted</res:Status>"

  Scenario: Invalid XML returns 400 with error message
    When I send invalid XML to the API Gateway
    Then the response status should be 400
    And the response should contain "Missing SOAP Body"
