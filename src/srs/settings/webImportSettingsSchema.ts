/**
 * 网页导入设置 Schema（Firecrawl 单提供商 MVP）
 *
 * API Key 不得硬编码；默认 scrape 端点为官方 v2。
 */

export const DEFAULT_FIRECRAWL_SCRAPE_URL =
  "https://api.firecrawl.dev/v2/scrape"

export const WEB_IMPORT_SETTINGS_KEYS = {
  firecrawlApiKey: "webImport.firecrawlApiKey",
  firecrawlApiUrl: "webImport.firecrawlApiUrl"
} as const

export const webImportSettingsSchema = {
  [WEB_IMPORT_SETTINGS_KEYS.firecrawlApiKey]: {
    label: "Firecrawl API Key",
    type: "string" as const,
    defaultValue: "",
    description: "Firecrawl API Key（仅保存在本机插件设置中，请勿泄露）"
  },
  [WEB_IMPORT_SETTINGS_KEYS.firecrawlApiUrl]: {
    label: "Firecrawl API URL",
    type: "string" as const,
    defaultValue: DEFAULT_FIRECRAWL_SCRAPE_URL,
    description:
      "Firecrawl scrape 端点，默认 https://api.firecrawl.dev/v2/scrape"
  }
}

export interface WebImportSettings {
  firecrawlApiKey: string
  firecrawlApiUrl: string
}

export function getWebImportSettings(pluginName: string): WebImportSettings {
  const settings = orca.state.plugins[pluginName]?.settings
  const apiUrl = settings?.[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiUrl]
  return {
    firecrawlApiKey:
      (settings?.[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiKey] as string) || "",
    firecrawlApiUrl:
      typeof apiUrl === "string" && apiUrl.trim()
        ? apiUrl.trim()
        : DEFAULT_FIRECRAWL_SCRAPE_URL
  }
}
