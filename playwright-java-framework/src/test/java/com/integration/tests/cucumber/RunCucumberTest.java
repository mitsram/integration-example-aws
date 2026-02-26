package com.integration.tests.cucumber;

import org.junit.platform.suite.api.*;

import static io.cucumber.junit.platform.engine.Constants.*;

/**
 * Cucumber test runner.
 * <p>
 * Run with: {@code mvn test -Pcucumber}
 * <p>
 * Feature files go in {@code src/test/resources/features/}.
 * Step definitions go in the {@code steps} sub-package.
 */
@Suite
@IncludeEngines("cucumber")
@SelectPackages("com.integration.tests.cucumber")
@ConfigurationParameter(key = FEATURES_PROPERTY_NAME, value = "src/test/resources/features")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "com.integration.tests.cucumber.steps")
@ConfigurationParameter(key = PLUGIN_PROPERTY_NAME, value = "pretty, html:target/cucumber-reports/report.html")
@ConfigurationParameter(key = FILTER_TAGS_PROPERTY_NAME, value = "not @wip")
public class RunCucumberTest {
    // This class is intentionally empty — configuration is via annotations.
}
