package com.integration.framework.xray;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Links a JUnit 5 test method to one or more Xray test issue keys.
 * <p>
 * When used with {@link XrayReportingExtension}, the test result is
 * automatically reported to Xray and the linked test issue is updated
 * with the execution status (PASS / FAIL / TODO).
 *
 * <pre>
 *   &#64;XrayTestKey("PROJ-101")
 *   &#64;Test
 *   void validSoapReturns202() { ... }
 *
 *   &#64;XrayTestKey({"PROJ-201", "PROJ-202"})
 *   &#64;Test
 *   void crossAppRoundTrip() { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface XrayTestKey {

    /**
     * One or more Xray test issue keys (e.g. "PROJ-101").
     */
    String[] value();
}
