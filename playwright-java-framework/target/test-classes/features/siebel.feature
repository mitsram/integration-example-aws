@integration
Feature: Siebel SOAP Messaging
  Siebel should send various SOAP message types to the integration
  layer and receive proper acknowledgements.

  Background:
    Given siebel is running

  Scenario Outline: Send different message types
    When I send a service request with type "<type>"
    Then the API response should indicate success
    And the message action should be "<type>"

    Examples:
      | type            |
      | ServiceRequest  |
      | AccountUpdate   |
      | BillingInquiry  |
