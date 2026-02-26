package com.integration.framework.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Centralised, environment-aware configuration.
 * <p>
 * Loads properties from {@code config-{env}.properties} on the classpath.
 * Every property can be overridden by a system property or environment
 * variable (system prop takes precedence).
 * <p>
 * Usage:
 * <pre>
 *   TestConfig cfg = TestConfig.load();          // reads -Dtest.env
 *   TestConfig cfg = TestConfig.load("docker");  // explicit
 *   String url = cfg.get("core.app1.url");
 * </pre>
 */
public final class TestConfig {

    private final Environment environment;
    private final Properties props;

    private TestConfig(Environment environment, Properties props) {
        this.environment = environment;
        this.props = props;
    }

    // ── Factory ─────────────────────────────────────────────────

    /** Load config for the environment specified by {@code -Dtest.env}. */
    public static TestConfig load() {
        String envName = System.getProperty("test.env",
                System.getenv().getOrDefault("TEST_ENV", "local"));
        return load(envName);
    }

    /** Load config for the given environment name. */
    public static TestConfig load(String envName) {
        Environment env = Environment.from(envName);
        String file = "config-" + env.name().toLowerCase() + ".properties";

        Properties props = new Properties();
        try (InputStream in = TestConfig.class.getClassLoader().getResourceAsStream(file)) {
            if (in != null) {
                props.load(in);
            } else {
                System.err.println("[TestConfig] WARNING – " + file + " not found on classpath, using defaults");
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to load " + file, e);
        }

        return new TestConfig(env, props);
    }

    // ── Accessors ───────────────────────────────────────────────

    public Environment getEnvironment() {
        return environment;
    }

    /**
     * Resolve a property value with the following precedence:
     * <ol>
     *   <li>System property ({@code -Dkey=value})</li>
     *   <li>Environment variable (dots replaced with underscores, uppercased)</li>
     *   <li>Properties file value</li>
     * </ol>
     */
    public String get(String key) {
        // 1. System property
        String sys = System.getProperty(key);
        if (sys != null) return sys;

        // 2. Environment variable  (core.app1.url → CORE_APP1_URL)
        String envKey = key.replace('.', '_').toUpperCase();
        String envVal = System.getenv(envKey);
        if (envVal != null) return envVal;

        // 3. Properties file
        return props.getProperty(key);
    }

    /** Resolve with a fallback default. */
    public String get(String key, String defaultValue) {
        String val = get(key);
        return val != null ? val : defaultValue;
    }

    public int getInt(String key, int defaultValue) {
        String val = get(key);
        return val != null ? Integer.parseInt(val.trim()) : defaultValue;
    }

    public boolean getBool(String key, boolean defaultValue) {
        String val = get(key);
        return val != null ? Boolean.parseBoolean(val.trim()) : defaultValue;
    }

    // ── Convenience shortcuts ───────────────────────────────────

    public String coreApp1Url() {
        return get("core.app1.url", "http://localhost:3001");
    }

    public String siebelUrl() {
        return get("siebel.url", "http://localhost:3002");
    }

    public String apiGatewayUrl() {
        return get("api.gateway.url", "http://localhost:8080");
    }

    public String redisHost() {
        return get("redis.host", "localhost");
    }

    public int redisPort() {
        return getInt("redis.port", 6380);
    }

    public String pubsubTopic() {
        return get("pubsub.topic", "integration-events");
    }

    public boolean headless() {
        return getBool("browser.headless", true);
    }

    public String browserType() {
        return get("browser.type", "chromium");
    }
}
