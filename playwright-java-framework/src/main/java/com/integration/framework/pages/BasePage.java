package com.integration.framework.pages;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;

/**
 * Base class for all Page Objects.
 * <p>
 * Enforces the Page Object pattern: subclasses encapsulate locators
 * and user-facing actions, keeping test classes free of selectors.
 * <p>
 * Example:
 * <pre>
 * public class DashboardPage extends BasePage {
 *     public DashboardPage(Page page) { super(page); }
 *
 *     public Locator heading() {
 *         return page.locator("h1");
 *     }
 *
 *     public void navigate() {
 *         page.navigate(baseUrl + "/dashboard");
 *     }
 * }
 * </pre>
 */
public abstract class BasePage {

    protected final Page page;

    protected BasePage(Page page) {
        this.page = page;
    }

    /** Navigate to the given absolute URL. */
    protected void navigateTo(String url) {
        page.navigate(url);
    }

    /** Wait for the network to be idle (useful after navigation). */
    protected void waitForNetworkIdle() {
        page.waitForLoadState(com.microsoft.playwright.options.LoadState.NETWORKIDLE);
    }

    /** Return the page title. */
    public String title() {
        return page.title();
    }

    /** Take a screenshot and return the bytes. */
    public byte[] screenshot() {
        return page.screenshot();
    }
}
