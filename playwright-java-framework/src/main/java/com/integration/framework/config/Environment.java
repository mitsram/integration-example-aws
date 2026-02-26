package com.integration.framework.config;

/**
 * Supported target environments.
 * Add new entries as you add config-{env}.properties files.
 */
public enum Environment {
    LOCAL,
    DOCKER,
    STAGING;

    public static Environment from(String name) {
        if (name == null || name.isBlank()) {
            return LOCAL;
        }
        return valueOf(name.trim().toUpperCase());
    }
}
