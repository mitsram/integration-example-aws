package com.integration.framework.xray;

import com.integration.framework.config.TestConfig;
import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * JUnit 5 extension that reports test results to Xray after each test method
 * annotated with {@link XrayTestKey}.
 * <p>
 * Results are collected during the test run and bulk-imported into Xray at the
 * end of the test class execution via the Xray Cloud REST API.
 *
 * <h3>Registration</h3>
 * Option 1 – per class:
 * <pre>
 *   &#64;ExtendWith(XrayReportingExtension.class)
 *   class MyTest extends BaseTest { ... }
 * </pre>
 *
 * Option 2 – global (auto-detection):
 * Add to {@code META-INF/services/org.junit.jupiter.api.extension.Extension}:
 * <pre>
 *   com.integration.framework.xray.XrayReportingExtension
 * </pre>
 *
 * <h3>How it works</h3>
 * <ol>
 *   <li>{@code @BeforeAll} – loads Xray config and authenticates</li>
 *   <li>After each test – captures status (PASS/FAIL) for methods with {@code @XrayTestKey}</li>
 *   <li>{@code @AfterAll} – imports all collected results to Xray in a single API call</li>
 * </ol>
 */
public class XrayReportingExtension implements BeforeAllCallback, AfterTestExecutionCallback, AfterAllCallback {

    private static final Logger LOG = LoggerFactory.getLogger(XrayReportingExtension.class);

    private static final ExtensionContext.Namespace NS =
            ExtensionContext.Namespace.create(XrayReportingExtension.class);

    private static final String KEY_CLIENT = "xrayClient";
    private static final String KEY_RESULTS = "xrayResults";
    private static final String KEY_ENABLED = "xrayEnabled";

    @Override
    public void beforeAll(ExtensionContext context) {
        TestConfig testConfig = TestConfig.load();
        XrayConfig xrayConfig = XrayConfig.from(testConfig);
        ExtensionContext.Store store = context.getStore(NS);

        if (!xrayConfig.isConfigured()) {
            LOG.info("[Xray] Reporting disabled – missing configuration");
            store.put(KEY_ENABLED, false);
            return;
        }

        try {
            XrayClient client = new XrayClient(xrayConfig);
            client.authenticate();
            store.put(KEY_CLIENT, client);
            store.put(KEY_ENABLED, true);
            store.put(KEY_RESULTS, Collections.synchronizedList(new ArrayList<XrayClient.TestResult>()));
            LOG.info("[Xray] Reporting enabled for project {}", xrayConfig.getProjectKey());
        } catch (XrayException e) {
            LOG.warn("[Xray] Authentication failed, reporting disabled: {}", e.getMessage());
            store.put(KEY_ENABLED, false);
        }
    }

    @Override
    public void afterTestExecution(ExtensionContext context) {
        ExtensionContext.Store store = getClassStore(context);
        Boolean enabled = store.get(KEY_ENABLED, Boolean.class);
        if (enabled == null || !enabled) {
            return;
        }

        Method method = context.getRequiredTestMethod();
        XrayTestKey annotation = method.getAnnotation(XrayTestKey.class);
        if (annotation == null) {
            return;
        }

        boolean failed = context.getExecutionException().isPresent();
        String status = failed ? "FAIL" : "PASS";
        String comment = buildComment(context, failed);

        @SuppressWarnings("unchecked")
        List<XrayClient.TestResult> results = store.get(KEY_RESULTS, List.class);

        for (String testKey : annotation.value()) {
            results.add(new XrayClient.TestResult(testKey, status, comment));
            LOG.info("[Xray] {} → {} ({})", testKey, status, context.getDisplayName());
        }
    }

    @Override
    public void afterAll(ExtensionContext context) {
        ExtensionContext.Store store = context.getStore(NS);
        Boolean enabled = store.get(KEY_ENABLED, Boolean.class);
        if (enabled == null || !enabled) {
            return;
        }

        @SuppressWarnings("unchecked")
        List<XrayClient.TestResult> results = store.get(KEY_RESULTS, List.class);
        if (results == null || results.isEmpty()) {
            LOG.info("[Xray] No annotated test results to report");
            return;
        }

        XrayClient client = store.get(KEY_CLIENT, XrayClient.class);
        try {
            String execKey = client.importExecutionResults(results);
            LOG.info("[Xray] {} result(s) imported → Test Execution {}", results.size(), execKey);
        } catch (XrayException e) {
            LOG.error("[Xray] Failed to import results: {}", e.getMessage());
        }
    }

    private ExtensionContext.Store getClassStore(ExtensionContext context) {
        return context.getParent()
                .orElse(context)
                .getStore(NS);
    }

    private String buildComment(ExtensionContext context, boolean failed) {
        StringBuilder sb = new StringBuilder();
        sb.append("Test: ").append(context.getDisplayName());
        context.getExecutionException().ifPresent(ex -> {
            sb.append("\n\n");
            StringWriter sw = new StringWriter();
            ex.printStackTrace(new PrintWriter(sw));
            String trace = sw.toString();
            if (trace.length() > 2000) {
                trace = trace.substring(0, 2000) + "\n... (truncated)";
            }
            sb.append(trace);
        });
        return sb.toString();
    }
}
