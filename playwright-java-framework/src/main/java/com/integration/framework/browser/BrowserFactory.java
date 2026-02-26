package com.integration.framework.browser;

import com.integration.framework.config.TestConfig;
import com.microsoft.playwright.*;

/**
 * Creates and manages Playwright browser instances.
 * <p>
 * Supports Chromium, Firefox, and WebKit. Configuration (headless mode,
 * browser type, slow-mo, viewport) comes from {@link TestConfig}.
 * <p>
 * Typical lifecycle:
 * <pre>
 *   BrowserFactory factory = new BrowserFactory(config);
 *   Browser browser = factory.createBrowser();
 *   BrowserContext ctx = factory.createContext(browser);
 *   Page page = ctx.newPage();
 *   // ... test ...
 *   browser.close();
 *   factory.close();   // closes Playwright runtime
 * </pre>
 */
public final class BrowserFactory {

    private final TestConfig config;
    private Playwright playwright;

    public BrowserFactory(TestConfig config) {
        this.config = config;
    }

    /** Lazily initialise the Playwright runtime. */
    private Playwright pw() {
        if (playwright == null) {
            playwright = Playwright.create();
        }
        return playwright;
    }

    /**
     * Launch a new browser of the type specified in config.
     * Defaults to Chromium if none specified.
     */
    public Browser createBrowser() {
        BrowserType.LaunchOptions opts = new BrowserType.LaunchOptions()
                .setHeadless(config.headless())
                .setSlowMo(config.getInt("browser.slowmo", 0));

        return switch (config.browserType().toLowerCase()) {
            case "firefox" -> pw().firefox().launch(opts);
            case "webkit" -> pw().webkit().launch(opts);
            default -> pw().chromium().launch(opts);
        };
    }

    /** Create a fresh browser context with optional viewport settings. */
    public BrowserContext createContext(Browser browser) {
        Browser.NewContextOptions ctxOpts = new Browser.NewContextOptions();

        int width = config.getInt("browser.viewport.width", 1280);
        int height = config.getInt("browser.viewport.height", 720);
        ctxOpts.setViewportSize(width, height);

        return browser.newContext(ctxOpts);
    }

    /** Convenience: create browser + context + page in one call. */
    public Page createPage() {
        Browser browser = createBrowser();
        BrowserContext context = createContext(browser);
        return context.newPage();
    }

    /** Shut down the Playwright runtime. */
    public void close() {
        if (playwright != null) {
            playwright.close();
            playwright = null;
        }
    }
}
