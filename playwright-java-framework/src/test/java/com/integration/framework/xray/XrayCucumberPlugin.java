package com.integration.framework.xray;

import com.integration.framework.config.TestConfig;
import io.cucumber.plugin.ConcurrentEventListener;
import io.cucumber.plugin.event.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cucumber plugin that reports scenario results to Xray.
 * <p>
 * Link a Cucumber scenario to an Xray test by tagging it with the test issue key:
 * <pre>
 *   &#64;PROJ-101
 *   Scenario: Valid SOAP request returns 202 Accepted
 *     ...
 * </pre>
 * <p>
 * The plugin detects tags that look like Jira issue keys (e.g. {@code @PROJ-101})
 * and reports the scenario's result status to Xray at the end of the test run.
 *
 * <h3>Registration</h3>
 * Add to your Cucumber runner or options:
 * <pre>
 *   &#64;ConfigurationParameter(key = PLUGIN_PROPERTY_NAME,
 *       value = "com.integration.framework.xray.XrayCucumberPlugin")
 * </pre>
 * Or in CLI: {@code --plugin com.integration.framework.xray.XrayCucumberPlugin}
 */
public class XrayCucumberPlugin implements ConcurrentEventListener {

    private static final Logger LOG = LoggerFactory.getLogger(XrayCucumberPlugin.class);

    /** Matches Jira-style issue keys like PROJ-123, ABC-1 */
    private static final Pattern ISSUE_KEY_PATTERN = Pattern.compile("^@([A-Z][A-Z0-9]+-\\d+)$");

    private final List<XrayClient.TestResult> results = new ArrayList<>();

    @Override
    public void setEventPublisher(EventPublisher publisher) {
        publisher.registerHandlerFor(TestCaseFinished.class, this::onTestCaseFinished);
        publisher.registerHandlerFor(TestRunFinished.class, this::onTestRunFinished);
    }

    private void onTestCaseFinished(TestCaseFinished event) {
        TestCase testCase = event.getTestCase();
        Collection<String> tags = testCase.getTags();

        List<String> xrayKeys = tags.stream()
                .map(ISSUE_KEY_PATTERN::matcher)
                .filter(Matcher::matches)
                .map(m -> m.group(1))
                .toList();

        if (xrayKeys.isEmpty()) {
            return;
        }

        Result result = event.getResult();
        String status = mapStatus(result.getStatus());
        String comment = buildComment(testCase, result);

        for (String key : xrayKeys) {
            results.add(new XrayClient.TestResult(key, status, comment));
            LOG.info("[Xray/Cucumber] {} → {} ({})", key, status, testCase.getName());
        }
    }

    private void onTestRunFinished(TestRunFinished event) {
        if (results.isEmpty()) {
            LOG.info("[Xray/Cucumber] No scenarios tagged with Xray test keys");
            return;
        }

        try {
            TestConfig testConfig = TestConfig.load();
            XrayConfig xrayConfig = XrayConfig.from(testConfig);

            if (!xrayConfig.isConfigured()) {
                LOG.info("[Xray/Cucumber] Reporting disabled – missing configuration");
                return;
            }

            XrayClient client = new XrayClient(xrayConfig);
            String execKey = client.importExecutionResults(results);
            LOG.info("[Xray/Cucumber] {} result(s) imported → Test Execution {}", results.size(), execKey);
        } catch (XrayException e) {
            LOG.error("[Xray/Cucumber] Failed to import results: {}", e.getMessage());
        }
    }

    private static String mapStatus(Status cucumberStatus) {
        return switch (cucumberStatus) {
            case PASSED -> "PASS";
            case FAILED -> "FAIL";
            case SKIPPED, PENDING -> "TODO";
            case UNDEFINED -> "TODO";
            case AMBIGUOUS -> "FAIL";
            case UNUSED -> "TODO";
        };
    }

    private static String buildComment(TestCase testCase, Result result) {
        StringBuilder sb = new StringBuilder();
        sb.append("Scenario: ").append(testCase.getName());
        sb.append("\nURI: ").append(testCase.getUri());

        if (result.getError() != null) {
            sb.append("\n\n").append(result.getError().getMessage());
        }
        return sb.toString();
    }
}
