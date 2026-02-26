# Playwright Java Framework

A Playwright-based Java test framework supporting **UI**, **API**, and **Contract** testing.  
Extensible for **Cucumber BDD**. Enforces **Page Object pattern** for UI tests.

## Architecture

```
src/
├── main/java/com/integration/framework/
│   ├── config/          # Environment-aware configuration
│   │   ├── Environment.java
│   │   └── TestConfig.java
│   ├── browser/         # Playwright browser lifecycle
│   │   └── BrowserFactory.java
│   ├── pages/           # Page Object base class
│   │   └── BasePage.java
│   ├── api/             # HTTP & SOAP clients (Playwright APIRequestContext)
│   │   ├── ApiClient.java
│   │   └── SoapClient.java
│   └── utils/           # Redis event collector, wait helpers
│       ├── EventCollector.java
│       └── WaitUtils.java
├── main/resources/
│   ├── config-local.properties
│   ├── config-docker.properties
│   └── config-staging.properties
└── test/java/com/integration/tests/
    ├── base/            # BaseTest with shared config
    ├── integration/     # API integration tests
    │   ├── InfrastructureTest.java
    │   ├── ApiGatewayTest.java
    │   ├── CoreApp1Test.java
    │   └── SiebelTest.java
    ├── e2e/             # Full pipeline E2E tests
    │   └── FullPipelineTest.java
    ├── contract/        # Pact consumer & provider tests
    │   ├── consumer/
    │   │   ├── CoreApp1SoapConsumerPactTest.java
    │   │   ├── SiebelSoapConsumerPactTest.java
    │   │   └── SiebelEventConsumerPactTest.java
    │   └── provider/
    │       ├── SoapApiProviderPactTest.java
    │       └── IntegrationEventProviderPactTest.java
    └── cucumber/        # BDD scaffolding
        ├── RunCucumberTest.java
        ├── steps/IntegrationSteps.java
        └── features/ (in test resources)
```

## Prerequisites

- **Java 17+**
- **Maven 3.9+**
- Docker stack running for integration/E2E/provider tests:
  ```bash
  cd ../integration-layer && docker compose up -d
  ```
- core-app-1 and siebel servers running for integration/E2E tests

## Quick Start

```bash
# Install dependencies and compile
mvn compile test-compile

# Install Playwright browsers (first time only)
mvn exec:java -e -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install"
```

## Running Tests

### By test suite (Maven profiles)

```bash
# Integration tests only
mvn test -Pintegration

# E2E tests only
mvn test -Pe2e

# Contract tests only
mvn test -Pcontract

# Cucumber BDD tests
mvn test -Pcucumber

# All tests
mvn test
```

### By environment

```bash
# Local (default)
mvn test -Pintegration

# Docker environment
mvn test -Pintegration -Pdocker

# Staging
mvn test -Pintegration -Pstaging

# Override individual properties
mvn test -Pintegration -Dcore.app1.url=http://custom-host:3001
```

### Specific test class

```bash
mvn test -Dtest=CoreApp1Test
mvn test -Dtest=FullPipelineTest
mvn test -Dtest=CoreApp1SoapConsumerPactTest
```

## Configuration

Environment-specific settings live in `src/main/resources/config-{env}.properties`.  
Every property can be overridden by:

1. **System property**: `-Dcore.app1.url=http://...`
2. **Environment variable**: `CORE_APP1_URL=http://...`
3. **Properties file value** (default)

| Property | Default | Description |
|----------|---------|-------------|
| `core.app1.url` | `http://localhost:3001` | core-app-1 base URL |
| `siebel.url` | `http://localhost:3002` | siebel base URL |
| `api.gateway.url` | `http://localhost:8080` | API Gateway base URL |
| `redis.host` | `localhost` | Redis hostname |
| `redis.port` | `6380` | Redis port |
| `pubsub.topic` | `integration-events` | Redis Pub/Sub topic |
| `browser.headless` | `true` | Run browser headless |
| `browser.type` | `chromium` | Browser: chromium/firefox/webkit |

## Contract Testing

Uses **Pact JVM** for consumer-driven contract testing.

### Workflow

1. **Consumer tests** generate pact files in `target/pacts/`:
   ```bash
   mvn test -Dtest="CoreApp1SoapConsumerPactTest,SiebelSoapConsumerPactTest,SiebelEventConsumerPactTest"
   ```

2. **Provider tests** verify against pact files:
   ```bash
   # Start Docker stack first
   mvn test -Dtest="SoapApiProviderPactTest,IntegrationEventProviderPactTest"
   ```

### Contracts Covered

| # | Consumer | Provider | Type | Description |
|---|----------|----------|------|-------------|
| 1 | core-app-1 | integration-layer | HTTP | PlannedOutage SOAP request → 202 |
| 2 | core-app-1 | integration-layer | HTTP | Invalid XML → 400 |
| 3 | siebel | integration-layer | HTTP | ServiceRequest SOAP → 202 |
| 4 | siebel | integration-layer | HTTP | AccountUpdate SOAP → 202 |
| 5 | siebel | integration-layer-events | Message | IntegrationEvent (PROCESSED) |
| 6 | siebel | integration-layer-events | Message | IntegrationEvent (minimal) |

## Extending with Cucumber

1. Add feature files to `src/test/resources/features/`
2. Add step definitions to `com.integration.tests.cucumber.steps`
3. Run: `mvn test -Pcucumber`

## Adding UI Tests

1. Extend `BasePage` for each page:
   ```java
   public class DashboardPage extends BasePage {
       public DashboardPage(Page page) { super(page); }
       
       public Locator heading() { return page.locator("h1"); }
       public void navigate(String url) { navigateTo(url); }
   }
   ```

2. Use `BrowserFactory` in tests:
   ```java
   @Tag("ui")
   class DashboardUITest extends BaseTest {
       private BrowserFactory factory;
       
       @BeforeEach
       void setup() {
           factory = new BrowserFactory(config);
       }
       
       @Test
       void dashboardLoads() {
           Page page = factory.createPage();
           DashboardPage dashboard = new DashboardPage(page);
           dashboard.navigate("http://localhost:3001");
           assertThat(dashboard.title()).contains("Dashboard");
           page.context().browser().close();
       }
       
       @AfterEach
       void teardown() { factory.close(); }
   }
   ```

## Test Mapping: TypeScript → Java

| TypeScript Test | Java Equivalent |
|-----------------|-----------------|
| `tests/integration/infrastructure.test.ts` | `InfrastructureTest.java` |
| `tests/integration/api-gateway.test.ts` | `ApiGatewayTest.java` |
| `tests/integration/core-app-1.test.ts` | `CoreApp1Test.java` |
| `tests/integration/siebel.test.ts` | `SiebelTest.java` |
| `tests/e2e/full-pipeline.test.ts` | `FullPipelineTest.java` |
| `core-app-1/tests/contract/soap-api.consumer.pact.test.ts` | `CoreApp1SoapConsumerPactTest.java` |
| `siebel/tests/contract/soap-api.consumer.pact.test.ts` | `SiebelSoapConsumerPactTest.java` |
| `siebel/tests/contract/integration-event.consumer.pact.test.ts` | `SiebelEventConsumerPactTest.java` |
| `integration-layer/tests/contract/soap-api.provider.pact.test.ts` | `SoapApiProviderPactTest.java` |
| `integration-layer/tests/contract/integration-event.provider.pact.test.ts` | `IntegrationEventProviderPactTest.java` |
