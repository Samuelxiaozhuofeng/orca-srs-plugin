/**
 * Web import unit tests: URL validation, Firecrawl client, HTML sanitization.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureTestDom } from "../epub/testDom"
import {
  installDefaultEditorMocks,
  installWebImportOrcaMock,
  mockOrca,
  resetBlocks
} from "./testHelpers"

beforeAll(() => {
  ensureTestDom()
})

installWebImportOrcaMock()

// Import after orca stub (modules read settings from orca only when scraping)
import {
  buildTitleFromMetadata,
  extractApiErrorSummary,
  isBlockedHostname,
  isDangerousUrl,
  resolveHttpUrl,
  sanitizePublicError,
  sanitizeWebHtml,
  scrapeWithFirecrawl,
  scrapeWebArticle,
  validateAndNormalizeUrl,
  WebImportError
} from "./webImport"

beforeEach(() => {
  resetBlocks()
  vi.clearAllMocks()
  installDefaultEditorMocks()
})

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

describe("validateAndNormalizeUrl", () => {
  it("accepts https and lowercases host, strips fragment and default port", () => {
    const r = validateAndNormalizeUrl("https://Example.COM:443/path#section")
    expect(r.canonicalUrl).toBe("https://example.com/path")
    expect(r.hostname).toBe("example.com")
  })

  it("strips default http port 80", () => {
    const r = validateAndNormalizeUrl("http://News.Example.org:80/a")
    expect(r.canonicalUrl).toBe("http://news.example.org/a")
  })

  it("rejects non-http schemes", () => {
    expect(() => validateAndNormalizeUrl("ftp://example.com")).toThrow(WebImportError)
    expect(() => validateAndNormalizeUrl("javascript:alert(1)")).toThrow(/http/)
  })

  it("rejects credentials", () => {
    expect(() =>
      validateAndNormalizeUrl("https://user:pass@example.com/x")
    ).toThrow(/用户名|密码/)
  })

  it("rejects localhost and .localhost", () => {
    expect(() => validateAndNormalizeUrl("http://localhost/a")).toThrow(/本机|内网/)
    expect(() => validateAndNormalizeUrl("http://app.localhost/a")).toThrow(/本机|内网/)
  })

  it("rejects private/link-local IPv4", () => {
    expect(() => validateAndNormalizeUrl("http://127.0.0.1/")).toThrow()
    expect(() => validateAndNormalizeUrl("http://192.168.1.1/")).toThrow()
    expect(() => validateAndNormalizeUrl("http://10.0.0.5/")).toThrow()
    expect(() => validateAndNormalizeUrl("http://172.16.0.1/")).toThrow()
    expect(() => validateAndNormalizeUrl("http://169.254.1.1/")).toThrow()
  })

  it("rejects IPv6 loopback / link-local / ULA", () => {
    expect(isBlockedHostname("::1")).toBe(true)
    expect(isBlockedHostname("fe80::1")).toBe(true)
    expect(isBlockedHostname("fd12:3456:789a::1")).toBe(true)
    expect(() => validateAndNormalizeUrl("http://[::1]/")).toThrow(WebImportError)
    expect(() => validateAndNormalizeUrl("http://[::1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
  })

  it("rejects IPv6 unspecified, IPv4-mapped (dotted+hex), multicast, site-local", () => {
    // unspecified ::
    expect(() => validateAndNormalizeUrl("http://[::]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
    // IPv4-mapped dotted (URL parser rewrites to hex form)
    expect(() => validateAndNormalizeUrl("http://[::ffff:127.0.0.1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
    // IPv4-mapped hex (as after URL parse)
    expect(() => validateAndNormalizeUrl("http://[::ffff:7f00:1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
    expect(isBlockedHostname("::ffff:7f00:1")).toBe(true)
    expect(isBlockedHostname("[::ffff:7f00:1]")).toBe(true)
    // IPv4-compatible form of loopback
    expect(() => validateAndNormalizeUrl("http://[::127.0.0.1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
    // multicast ff00::/8
    expect(() => validateAndNormalizeUrl("http://[ff02::1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
    // deprecated site-local fec0::/10
    expect(() => validateAndNormalizeUrl("http://[fec0::1]/")).toThrow(
      expect.objectContaining({ code: "private_url" })
    )
  })

  it("allows public hosts and public IPv6", () => {
    expect(() => validateAndNormalizeUrl("https://example.com/post")).not.toThrow()
    expect(isBlockedHostname("example.com")).toBe(false)
    // documentation / public-range examples should not be blocked as private
    expect(isBlockedHostname("2001:db8::1")).toBe(false)
    expect(() => validateAndNormalizeUrl("http://[2001:db8::1]/")).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Firecrawl
// ---------------------------------------------------------------------------

describe("scrapeWithFirecrawl", () => {
  it("parses success response with html and metadata", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          html: "<article><h1>Hello</h1><p>Body text here</p></article>",
          metadata: { title: "Hello", author: "Ada" }
        }
      })
    }))

    const result = await scrapeWithFirecrawl({
      url: "https://example.com/a",
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.html).toContain("Body text")
    expect(result.metadata.title).toBe("Hello")
    expect(fetchImpl).toHaveBeenCalled()
    const callArgs = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    const init = callArgs[1]
    const body = JSON.parse(init.body)
    expect(body.formats).toEqual(["html"])
    expect(body.onlyMainContent).toBe(true)
    expect(init.headers.Authorization).toBe("Bearer test-key")
  })

  it("throws distinct errors for missing key / 401 / 402 / 429 / empty html", async () => {
    await expect(
      scrapeWithFirecrawl({ url: "https://example.com", apiKey: "" })
    ).rejects.toMatchObject({ code: "missing_api_key" })

    const makeFetch = (status: number, body: unknown) =>
      vi.fn(async () => ({
        status,
        json: async () => body
      })) as unknown as typeof fetch

    await expect(
      scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: "k",
        fetchImpl: makeFetch(401, { error: "Unauthorized" })
      })
    ).rejects.toMatchObject({ code: "http_401" })

    await expect(
      scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: "k",
        fetchImpl: makeFetch(402, { error: "Payment required" })
      })
    ).rejects.toMatchObject({ code: "http_402" })

    await expect(
      scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: "k",
        fetchImpl: makeFetch(429, { error: "rate limit" })
      })
    ).rejects.toMatchObject({ code: "http_429" })

    await expect(
      scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: "k",
        fetchImpl: makeFetch(200, { success: true, data: { html: "   " } })
      })
    ).rejects.toMatchObject({ code: "empty_html" })

    await expect(
      scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: "k",
        fetchImpl: makeFetch(200, { success: false, error: "bad" })
      })
    ).rejects.toMatchObject({ code: "api_error" })
  })

  it("does not leak api key in error messages", async () => {
    const secret = "sk-super-secret-key-value"
    const fetchImpl = vi.fn(async () => {
      throw new Error(`Request failed Authorization: Bearer ${secret}`)
    }) as unknown as typeof fetch

    try {
      await scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: secret,
        fetchImpl
      })
      expect.unreachable("should throw")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      expect(msg).not.toContain(secret)
      expect(sanitizePublicError(`Bearer ${secret}`, secret)).not.toContain(secret)
    }
  })

  it("redacts arbitrary configured api key echoed in API error body", async () => {
    // Non fc-/sk- shape — must still be stripped via exact key replace
    const secret = "my-custom-firecrawl-token-xyz-987"
    const fetchImpl = vi.fn(async () => ({
      status: 500,
      json: async () => ({
        success: false,
        error: `upstream rejected key ${secret}`,
        message: `invalid token: ${secret}`
      })
    })) as unknown as typeof fetch

    try {
      await scrapeWithFirecrawl({
        url: "https://example.com",
        apiKey: secret,
        fetchImpl
      })
      expect.unreachable("should throw")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      expect(msg).not.toContain(secret)
      expect(msg).toMatch(/Firecrawl|HTTP|失败|错误/)
    }
  })

  it("maps abort to aborted code", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted")
          err.name = "AbortError"
          reject(err)
        })
      })
    }) as unknown as typeof fetch

    const p = scrapeWithFirecrawl({
      url: "https://example.com",
      apiKey: "k",
      fetchImpl,
      signal: controller.signal
    })
    controller.abort()
    await expect(p).rejects.toMatchObject({ code: "aborted" })
  })
})

describe("buildTitleFromMetadata / extractApiErrorSummary", () => {
  it("prefers title then ogTitle then hostname", () => {
    expect(buildTitleFromMetadata({ title: "T" }, "h.com")).toBe("T")
    expect(buildTitleFromMetadata({ ogTitle: "OG" }, "h.com")).toBe("OG")
    expect(buildTitleFromMetadata({}, "h.com")).toBe("h.com")
  })

  it("summarizes api error fields without dumping secrets", () => {
    const s = extractApiErrorSummary({
      error: "fail",
      message: "Bearer sk-abc123xyz",
      details: { code: "X" }
    })
    expect(s).toContain("fail")
    expect(s).not.toContain("sk-abc123xyz")
  })
})

// ---------------------------------------------------------------------------
// HTML sanitize
// ---------------------------------------------------------------------------

describe("sanitizeWebHtml", () => {
  const base = "https://example.com/posts/1"

  it("removes script/style tags, event handlers, and inline style attributes", () => {
    const html = `
      <div>
        <script>alert(1)</script>
        <style>body{}</style>
        <p onclick="evil()" onmouseover="x()" style="position:fixed;background:url(//evil)">Safe</p>
      </div>
    `
    const out = sanitizeWebHtml(html, base, "Title")
    expect(out.toLowerCase()).not.toContain("script")
    expect(out.toLowerCase()).not.toContain("onclick")
    expect(out.toLowerCase()).not.toContain("onmouseover")
    expect(out.toLowerCase()).not.toContain("style=")
    expect(out.toLowerCase()).not.toContain("position:fixed")
    expect(out).toContain("Safe")
  })

  it("strips dangerous urls and resolves relative images", () => {
    const html = `
      <p><a href="javascript:alert(1)">x</a></p>
      <img src="/img/a.png" />
      <img src="data:image/png;base64,aaa" />
      <img src="blob:https://example.com/x" />
    `
    const out = sanitizeWebHtml(html, base, "Title")
    expect(out.toLowerCase()).not.toContain("javascript:")
    expect(out).toContain("https://example.com/img/a.png")
    expect(out).not.toContain("data:image")
    expect(out).not.toContain("blob:")
  })

  it("removes first heading matching page title", () => {
    const html = `
      <h1>My Article</h1>
      <p>intro</p>
      <h2>Section</h2>
      <p>body</p>
    `
    const out = sanitizeWebHtml(html, base, "My Article")
    expect(out).not.toMatch(/<h1[^>]*>\s*My Article\s*<\/h1>/i)
    expect(out).toMatch(/<h2[^>]*>\s*Section\s*<\/h2>/i)
  })

  it("isDangerousUrl and resolveHttpUrl helpers", () => {
    expect(isDangerousUrl("javascript:void(0)")).toBe(true)
    expect(isDangerousUrl("https://ok.com")).toBe(false)
    expect(resolveHttpUrl("../x.png", "https://example.com/a/b")).toBe(
      "https://example.com/x.png"
    )
    expect(resolveHttpUrl("data:image/png;base64,x", base)).toBeNull()
  })
})

describe("scrapeWebArticle integration (mocked fetch)", () => {
  it("returns preview without writing Orca", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          html: "<h1>T</h1><p>Hello from the web with enough characters for a real article body.</p>",
          metadata: { title: "T", siteName: "Blog" }
        }
      })
    })) as unknown as typeof fetch

    const article = await scrapeWebArticle({
      url: "https://example.com/post",
      pluginName: "orca-srs",
      fetchImpl,
      apiKey: "k"
    })
    expect(article.title).toBe("T")
    expect(article.hostname).toBe("example.com")
    expect(article.textLength).toBeGreaterThan(0)
    // Plain-text length only — never fall back to raw markup length
    expect(article.textLength).toBeLessThan(article.html.length + 1)
    expect(typeof article.excerpt === "string" || article.excerpt === undefined).toBe(true)
    expect(Array.isArray(article.warnings) || article.warnings === undefined).toBe(true)
    expect(mockOrca.commands.invokeEditorCommand).not.toHaveBeenCalled()
  })

  it("rejects markup-only cleaned body as empty_html", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          html: "<div><span class='x'></span><i></i></div>",
          metadata: { title: "Empty" }
        }
      })
    })) as unknown as typeof fetch

    await expect(
      scrapeWebArticle({
        url: "https://example.com/empty",
        pluginName: "orca-srs",
        fetchImpl,
        apiKey: "k"
      })
    ).rejects.toMatchObject({ code: "empty_html" })
  })
})

describe("resolveWebImportSettingsForTest", () => {
  it("allows non-empty explicit apiKey when settings read would fail", async () => {
    const { resolveWebImportSettingsForTest } = await import("./webImport")
    // plugin missing from orca.state.plugins — getWebImportSettings still returns empty key object
    // simulate failure via bogus plugin that throws when accessed oddly: stub settings getter
    const original = mockOrca.state.plugins
    Object.defineProperty(mockOrca.state, "plugins", {
      configurable: true,
      get() {
        throw new Error("settings unavailable")
      }
    })
    try {
      const r = resolveWebImportSettingsForTest({
        url: "https://example.com",
        pluginName: "orca-srs",
        apiKey: "explicit-key"
      })
      expect(r.firecrawlApiKey).toBe("explicit-key")
      expect(r.firecrawlApiUrl).toContain("firecrawl")
    } finally {
      Object.defineProperty(mockOrca.state, "plugins", {
        configurable: true,
        value: original,
        writable: true
      })
      // restore normal shape
      mockOrca.state.plugins = original
    }
  })

  it("throws when apiUrl-only override and settings read fails", async () => {
    const { resolveWebImportSettingsForTest, WebImportError: WIE } = await import(
      "./webImport"
    )
    const original = mockOrca.state.plugins
    Object.defineProperty(mockOrca.state, "plugins", {
      configurable: true,
      get() {
        throw new Error("settings unavailable")
      }
    })
    try {
      expect(() =>
        resolveWebImportSettingsForTest({
          url: "https://example.com",
          pluginName: "orca-srs",
          apiUrl: "https://custom.firecrawl.example/v2/scrape"
        })
      ).toThrow(WIE)
      expect(() =>
        resolveWebImportSettingsForTest({
          url: "https://example.com",
          pluginName: "orca-srs",
          apiUrl: "https://custom.firecrawl.example/v2/scrape"
        })
      ).toThrow(/无法读取网页导入设置/)
    } finally {
      Object.defineProperty(mockOrca.state, "plugins", {
        configurable: true,
        value: original,
        writable: true
      })
      mockOrca.state.plugins = original
    }
  })
})
