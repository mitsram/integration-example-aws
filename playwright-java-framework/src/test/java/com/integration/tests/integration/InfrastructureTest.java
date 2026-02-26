package com.integration.tests.integration;

import com.integration.framework.api.ApiClient;
import com.integration.tests.base.BaseTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import redis.clients.jedis.Jedis;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * System Integration Tests – Infrastructure
 *
 * Verifies that all infrastructure components (Docker stack) are
 * running and accessible from the host:
 *   - API Gateway (Nginx) on port 8080
 *   - ElasticMQ (SQS) on port 9424
 *   - Redis on port 6380
 *   - core-app-1 on port 3001
 *   - siebel on port 3002
 */
@Tag("integration")
@DisplayName("Infrastructure Health Checks")
class InfrastructureTest extends BaseTest {

    @Test
    @DisplayName("API Gateway is healthy")
    void apiGatewayIsHealthy() {
        try (ApiClient api = ApiClient.create(apiGatewayUrl())) {
            JsonNode body = api.getJsonParsed("/health");
            assertThat(body.get("status").asText()).isEqualTo("ok");
            assertThat(body.get("service").asText()).isEqualTo("api-gateway");
        }
    }

    @Test
    @DisplayName("core-app-1 is healthy")
    void coreApp1IsHealthy() {
        try (ApiClient api = ApiClient.create(coreApp1Url())) {
            JsonNode body = api.getJsonParsed("/health");
            assertThat(body.get("status").asText()).isEqualTo("ok");
            assertThat(body.get("service").asText()).isEqualTo("core-app-1");
        }
    }

    @Test
    @DisplayName("siebel is healthy")
    void siebelIsHealthy() {
        try (ApiClient api = ApiClient.create(siebelUrl())) {
            JsonNode body = api.getJsonParsed("/health");
            assertThat(body.get("status").asText()).isEqualTo("ok");
            assertThat(body.get("service").asText()).isEqualTo("siebel");
        }
    }

    @Test
    @DisplayName("Redis is reachable")
    void redisIsReachable() {
        try (Jedis jedis = new Jedis(config.redisHost(), config.redisPort())) {
            String pong = jedis.ping();
            assertThat(pong).isEqualTo("PONG");
        }
    }

    @Test
    @DisplayName("ElasticMQ (SQS) is reachable")
    void elasticMqIsReachable() {
        try (ApiClient api = ApiClient.create("http://localhost:9424")) {
            var res = api.get("/");
            // Any response (even 404) means ElasticMQ is up
            assertThat(res.status()).isGreaterThan(0);
        }
    }
}
