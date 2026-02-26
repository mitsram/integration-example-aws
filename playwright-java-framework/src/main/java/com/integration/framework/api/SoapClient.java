package com.integration.framework.api;

/**
 * Convenience wrapper for sending SOAP XML via the API Gateway.
 * <p>
 * Builds well-formed SOAP envelopes with the project's standard
 * namespaces and delegates sending to an {@link ApiClient}.
 */
public final class SoapClient implements AutoCloseable {

    private final ApiClient api;

    public SoapClient(String baseUrl) {
        this.api = ApiClient.create(baseUrl);
    }

    /** Send raw SOAP XML to the /soap endpoint. */
    public SoapResponse send(String soapXml) {
        var res = api.postXml("/soap", soapXml);
        return new SoapResponse(res.status(), res.text());
    }

    @Override
    public void close() {
        api.close();
    }

    // ── Response record ─────────────────────────────────────────

    public record SoapResponse(int status, String body) {

        public boolean isAccepted() {
            return status == 202;
        }

        public boolean containsTag(String tag) {
            return body != null && body.contains(tag);
        }
    }
}
