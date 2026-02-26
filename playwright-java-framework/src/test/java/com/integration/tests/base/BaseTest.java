package com.integration.tests.base;

import com.integration.framework.api.ApiClient;
import com.integration.framework.config.TestConfig;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;

/**
 * Base class for all API / integration tests.
 * <p>
 * Loads environment-specific configuration and provides shared
 * {@link ApiClient} instances for the three main services.
 * <p>
 * Subclass this for integration, E2E, or any HTTP-based test.
 */
public abstract class BaseTest {

    protected static TestConfig config;

    @BeforeAll
    static void initConfig() {
        config = TestConfig.load();
    }

    // ── Helpers available to all tests ───────────────────────────

    protected static String coreApp1Url() {
        return config.coreApp1Url();
    }

    protected static String siebelUrl() {
        return config.siebelUrl();
    }

    protected static String apiGatewayUrl() {
        return config.apiGatewayUrl();
    }
}
