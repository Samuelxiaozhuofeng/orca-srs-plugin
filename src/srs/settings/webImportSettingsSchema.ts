/**
 * 网页导入 Firecrawl 设置：独立服务面板 + plugin data 持久化
 *
 * 不再注册到原生 setSettingsSchema。
 * 兼容：hydrate 时从旧 settings 键迁移。
 */

export const DEFAULT_FIRECRAWL_SCRAPE_URL =
  "https://api.firecrawl.dev/v2/scrape"

/** plugin data 键 */
export const FIRECRAWL_CONNECTION_DATA_KEY = "webImport.firecrawl" as const

/** 历史 settings 键（只读迁移） */
export const WEB_IMPORT_SETTINGS_KEYS = {
  firecrawlApiKey: "webImport.firecrawlApiKey",
  firecrawlApiUrl: "webImport.firecrawlApiUrl"
} as const

/**
 * @deprecated 已移出原生设置页；保留空对象以免外部 spread 报错。
 */
export const webImportSettingsSchema = {} as const

export interface WebImportSettings {
  firecrawlApiKey: string
  firecrawlApiUrl: string
}

type CacheEntry = { value: WebImportSettings }

const firecrawlCache = new Map<string, CacheEntry>()

export function clearWebImportSettingsCache(pluginName?: string): void {
  if (pluginName) {
    firecrawlCache.delete(pluginName)
    return
  }
  firecrawlCache.clear()
}

export function normalizeWebImportSettings(
  input: Partial<WebImportSettings> | null | undefined
): WebImportSettings {
  const firecrawlApiKey =
    typeof input?.firecrawlApiKey === "string" ? input.firecrawlApiKey.trim() : ""
  const urlRaw =
    typeof input?.firecrawlApiUrl === "string" ? input.firecrawlApiUrl.trim() : ""
  return {
    firecrawlApiKey,
    firecrawlApiUrl: urlRaw || DEFAULT_FIRECRAWL_SCRAPE_URL
  }
}

function readFromPluginSettings(pluginName: string): WebImportSettings | null {
  const settings = orca.state.plugins[pluginName]?.settings as
    | Record<string, unknown>
    | undefined
  if (!settings) return null
  const hasAny =
    typeof settings[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiKey] === "string" ||
    typeof settings[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiUrl] === "string"
  if (!hasAny) return null
  return normalizeWebImportSettings({
    firecrawlApiKey:
      (settings[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiKey] as string) || "",
    firecrawlApiUrl:
      (settings[WEB_IMPORT_SETTINGS_KEYS.firecrawlApiUrl] as string) || ""
  })
}

export function getWebImportSettings(pluginName: string): WebImportSettings {
  const cached = firecrawlCache.get(pluginName)
  if (cached) return { ...cached.value }

  const fromSettings = readFromPluginSettings(pluginName)
  if (fromSettings) return fromSettings

  return normalizeWebImportSettings({})
}

function parseDataPayload(data: unknown): WebImportSettings | null {
  if (data == null) return null
  if (typeof data !== "string" || data.trim() === "") return null
  try {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== "object") return null
    return normalizeWebImportSettings(parsed as Partial<WebImportSettings>)
  } catch (error) {
    console.warn("[WebImport Settings] firecrawl data JSON 解析失败:", error)
    return null
  }
}

export async function hydrateWebImportSettings(
  pluginName: string
): Promise<WebImportSettings> {
  let fromData: WebImportSettings | null = null
  try {
    const data = await orca.plugins.getData(
      pluginName,
      FIRECRAWL_CONNECTION_DATA_KEY
    )
    fromData = parseDataPayload(data)
  } catch (error) {
    console.warn(
      `[WebImport Settings] getData(${FIRECRAWL_CONNECTION_DATA_KEY}) 失败:`,
      error
    )
  }

  if (fromData) {
    firecrawlCache.set(pluginName, { value: fromData })
    return { ...fromData }
  }

  const fromSettings = readFromPluginSettings(pluginName)
  if (fromSettings) {
    try {
      await orca.plugins.setData(
        pluginName,
        FIRECRAWL_CONNECTION_DATA_KEY,
        JSON.stringify(fromSettings)
      )
    } catch (error) {
      console.error(
        "[WebImport Settings] 从 settings 迁移到 setData 失败:",
        error
      )
    }
    firecrawlCache.set(pluginName, { value: fromSettings })
    return { ...fromSettings }
  }

  const defaults = normalizeWebImportSettings({})
  firecrawlCache.set(pluginName, { value: defaults })
  return { ...defaults }
}

export async function saveWebImportSettings(
  pluginName: string,
  next: Partial<WebImportSettings>
): Promise<WebImportSettings> {
  const cleaned = normalizeWebImportSettings(next)
  await orca.plugins.setData(
    pluginName,
    FIRECRAWL_CONNECTION_DATA_KEY,
    JSON.stringify(cleaned)
  )
  firecrawlCache.set(pluginName, { value: cleaned })
  return { ...cleaned }
}
