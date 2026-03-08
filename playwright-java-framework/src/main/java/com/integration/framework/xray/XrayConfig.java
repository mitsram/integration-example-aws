package com.integration.framework.xray;

import com.integration.framework.config.TestConfig;

/**
 * Configuration for Xray Cloud REST API integration.
 * <p>
 * All values can be set via properties file, system properties, or environment variables
 * following the same precedence rules as {@link TestConfig}.
 *
 * <pre>
 *   # config-local.properties
 *   xray.enabled=true
 *   xray.base.url=https://xray.cloud.getxray.app
 *   xray.client.id=YOUR_CLIENT_ID
 *   xray.client.secret=YOUR_CLIENT_SECRET
 *   xray.project.key=PROJ
 *   xray.test.plan.key=PROJ-123
 *   xray.test.execution.key=           # leave blank to auto-create
 * </pre>
 */
public final class XrayConfig {

    private final boolean enabled;
    private final String baseUrl;
    private final String clientId;
    private final String clientSecret;
    private final String projectKey;
    private final String testPlanKey;
    private final String testExecutionKey;

    private XrayConfig(boolean enabled, String baseUrl, String clientId,
                       String clientSecret, String projectKey,
                       String testPlanKey, String testExecutionKey) {
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.projectKey = projectKey;
        this.testPlanKey = testPlanKey;
        this.testExecutionKey = testExecutionKey;
    }

    /**
     * Load Xray configuration from the given {@link TestConfig}.
     */
    public static XrayConfig from(TestConfig config) {
        return new XrayConfig(
                config.getBool("xray.enabled", false),
                config.get("xray.base.url", "https://xray.cloud.getxray.app"),
                config.get("xray.client.id", ""),
                config.get("xray.client.secret", ""),
                config.get("xray.project.key", ""),
                config.get("xray.test.plan.key", ""),
                config.get("xray.test.execution.key", "")
        );
    }

    public boolean isEnabled()          { return enabled; }
    public String getBaseUrl()          { return baseUrl; }
    public String getClientId()         { return clientId; }
    public String getClientSecret()     { return clientSecret; }
    public String getProjectKey()       { return projectKey; }
    public String getTestPlanKey()      { return testPlanKey; }
    public String getTestExecutionKey() { return testExecutionKey; }

    /**
     * Returns true if all required credentials are present.
     */
    public boolean isConfigured() {
        return enabled
                && !clientId.isBlank()
                && !clientSecret.isBlank()
                && !projectKey.isBlank();
    }
}
