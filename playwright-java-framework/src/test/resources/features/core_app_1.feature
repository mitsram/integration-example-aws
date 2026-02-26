@integration
Feature: core-app-1 Outage Notifications
  core-app-1 should send planned outage SOAP messages to the
  integration layer and receive successful responses.

  Background:
    Given core-app-1 is running

  Scenario: Send default planned outage notification
    When I send a planned outage notification
    Then the API response should indicate success
    And the outage ID should start with "OUTAGE-"
