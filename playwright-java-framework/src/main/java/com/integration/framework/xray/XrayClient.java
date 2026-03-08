package com.integration.framework.xray;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * REST client for the <a href="https://docs.getxray.app/display/XRAYCLOUD/REST+API">Xray Cloud REST API v2</a>.
 * <p>
 * Authenticates using client credentials and imports test execution results
 * so that Xray test issues are updated with PASS / FAIL / TODO status.
 *
 * <h3>Usage</h3>
 * <pre>
 *   XrayConfig cfg = XrayConfig.from(testConfig);
 *   XrayClient client = new XrayClient(cfg);
 *
 *   client.importExecutionResults(List.of(
 *       new XrayClient.TestResult("PROJ-101", "PASS", "Completed in 1.2s"),
 *       new XrayClient.TestResult("PROJ-102", "FAIL", "AssertionError: expected 200")
 *   ));
 * </pre>
 */
public final class XrayClient {

    private static final Logger LOG = LoggerFactory.getLogger(XrayClient.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    private final XrayConfig config;
    private final HttpClient httpClient;
    private String authToken;

    public XrayClient(XrayConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .build();
    }

    /**
     * A single test result to report to Xray.
     *
     * @param testKey  The Xray test issue key (e.g. "PROJ-101")
     * @param status   One of: PASS, FAIL, TODO, EXECUTING, ABORTED
     * @param comment  Optional comment (stack trace, duration, etc.)
     */
    public record TestResult(String testKey, String status, String comment) {

        public TestResult(String testKey, String status) {
            this(testKey, status, "");
        }
    }

    /**
     * Authenticate with Xray Cloud and obtain a bearer token.
     *
     * @throws XrayException if authentication fails
     */
    public void authenticate() {
        if (!config.isConfigured()) {
            throw new XrayException("Xray is not configured. Set xray.client.id, xray.client.secret, and xray.project.key.");
        }

        String url = config.getBaseUrl() + "/api/v2/authenticate";

        ObjectNode body = MAPPER.createObjectNode();
        body.put("client_id", config.getClientId());
        body.put("client_secret", config.getClientSecret());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .timeout(TIMEOUT)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                // Response is a plain JSON string (quoted token)
                authToken = response.body().replaceAll("\"", "");
                LOG.info("[Xray] Authenticated successfully");
            } else {
                throw new XrayException("Xray authentication failed (HTTP " + response.statusCode() + "): " + response.body());
            }
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new XrayException("Xray authentication request failed", e);
        }
    }

    /**
     * Import test execution results into Xray.
     * <p>
     * Creates or updates a Test Execution issue in Jira and sets the status
     * of each linked Xray Test issue.
     *
     * @param results list of test results to report
     * @return the Xray test execution issue key (e.g. "PROJ-456")
     * @throws XrayException if the import fails
     */
    public String importExecutionResults(List<TestResult> results) {
        if (authToken == null) {
            authenticate();
        }

        String url = config.getBaseUrl() + "/api/v2/import/execution";
        String payload = buildExecutionPayload(results);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + authToken)
                .timeout(TIMEOUT)
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode json = MAPPER.readTree(response.body());
                String execKey = json.path("key").asText("unknown");
                LOG.info("[Xray] Execution results imported → {}", execKey);
                return execKey;
            } else {
                throw new XrayException("Failed to import execution results (HTTP " + response.statusCode() + "): " + response.body());
            }
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new XrayException("Xray import request failed", e);
        }
    }

    /**
     * Report a single test result immediately.
     */
    public String reportSingleResult(TestResult result) {
        return importExecutionResults(List.of(result));
    }

    private String buildExecutionPayload(List<TestResult> results) {
        ObjectNode root = MAPPER.createObjectNode();

        // Test Execution info
        ObjectNode info = root.putObject("info");
        info.put("project", config.getProjectKey());
        info.put("summary", "Automated Test Execution – " + OffsetDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        info.put("description", "Results imported from playwright-java-framework");
        info.put("startDate", OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));

        if (!config.getTestPlanKey().isBlank()) {
            info.put("testPlanKey", config.getTestPlanKey());
        }
        if (!config.getTestExecutionKey().isBlank()) {
            root.put("testExecutionKey", config.getTestExecutionKey());
        }

        // Individual test results
        ArrayNode tests = root.putArray("tests");
        for (TestResult r : results) {
            ObjectNode test = tests.addObject();
            test.put("testKey", r.testKey());
            test.put("status", r.status());
            if (r.comment() != null && !r.comment().isBlank()) {
                test.put("comment", r.comment());
            }
            test.put("executedBy", "automation");
        }

        return root.toString();
    }
}
