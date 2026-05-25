import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'

/**
 * Holds a single Chromium browser instance across multiple render calls.
 * Each getPage() returns a fresh BrowserContext + Page (cheap, isolates state);
 * the underlying browser stays warm.
 *
 * Used as a singleton in the MCP server. CLI shims construct one per invocation
 * and close it on exit.
 */
export class BrowserPool {
  private browser?: Browser
  private launching?: Promise<Browser>

  async getPage(viewport?: { width: number; height: number }, opts?: { deviceScaleFactor?: number }): Promise<{ page: Page; context: BrowserContext }> {
    const browser = await this.ensureBrowser()
    const context = await browser.newContext({
      viewport: viewport ?? { width: 1280, height: 720 },
      deviceScaleFactor: opts?.deviceScaleFactor,
    })
    const page = await context.newPage()
    return { page, context }
  }

  async release(context: BrowserContext): Promise<void> {
    try { await context.close() } catch {}
  }

  async close(): Promise<void> {
    if (this.browser) {
      try { await this.browser.close() } catch {}
      this.browser = undefined
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser
    if (this.launching) return this.launching
    this.launching = chromium.launch().then((b) => {
      this.browser = b
      this.launching = undefined
      return b
    })
    return this.launching
  }
}
