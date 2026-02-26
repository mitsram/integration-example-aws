package com.integration.framework.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.APIRequest;
import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.RequestOptions;

import java.util.Map;

/**
 * Lightweight HTTP client built on Playwright's {@link APIRequestContext}.
 * <p>
 * Provides JSON and raw-text helpers for REST and SOAP calls.
 * Thread-safe per instance (each test should create its own).
 */
public final class ApiClient implements AutoCloseable {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Playwright playwright;
    private final APIRequestContext request;

    private ApiClient(Playwright playwright, APIRequestContext request) {
        this.playwright = playwright;
        this.request = request;
    }

    /** Create an ApiClient targeting the given base URL. */
    public static ApiClient create(String baseUrl) {
        Playwright pw = Playwright.create();
        APIRequestContext ctx = pw.request().newContext(
                new APIRequest.NewContextOptions().setBaseURL(baseUrl));
        return new ApiClient(pw, ctx);
    }

    // ── JSON helpers ────────────────────────────────────────────

    public APIResponse postJson(String path, Object body) {
        String json;
        try {
            json = MAPPER.writeValueAsString(body);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialise request body", e);
        }
        return request.post(path, RequestOptions.create()
                .setHeader("Content-Type", "application/json")
                .setData(json));
    }

    public JsonNode postJsonParsed(String path, Object body) {
        return parseJson(postJson(path, body).text());
    }

    public APIResponse get(String path) {
        return request.get(path);
    }

    public JsonNode getJsonParsed(String path) {
        return parseJson(get(path).text());
    }

    // ── SOAP / raw-XML helpers ──────────────────────────────────

    public APIResponse postXml(String path, String xml) {
        return request.post(path, RequestOptions.create()
                .setHeader("Content-Type", "text/xml; charset=utf-8")
                .setData(xml));
    }

    // ── Generic helpers ─────────────────────────────────────────

    public APIResponse post(String path, RequestOptions options) {
        return request.post(path, options);
    }

    public static JsonNode parseJson(String raw) {
        try {
            return MAPPER.readTree(raw);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse JSON: " + raw, e);
        }
    }

    @Override
    public void close() {
        request.dispose();
        playwright.close();
    }
}
