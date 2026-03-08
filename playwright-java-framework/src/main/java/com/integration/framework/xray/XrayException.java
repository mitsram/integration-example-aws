package com.integration.framework.xray;

/**
 * Unchecked exception for Xray API failures.
 */
public class XrayException extends RuntimeException {

    public XrayException(String message) {
        super(message);
    }

    public XrayException(String message, Throwable cause) {
        super(message, cause);
    }
}
