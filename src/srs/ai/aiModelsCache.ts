/**
 * 兼容模型列表内存缓存：服务设置「拉取模型」与提示词库下拉共用。
 * 不持久化；关闭 Orca 后需重新拉取。
 */

type ModelsCacheEntry = {
  models: string[]
  /** 拉取时使用的 apiUrl（用于判断是否仍匹配当前连接） */
  apiUrl: string
  fetchedAt: number
}

const modelsCache = new Map<string, ModelsCacheEntry>()

export function clearCompatibleModelsCache(pluginName?: string): void {
  if (pluginName) {
    modelsCache.delete(pluginName)
    return
  }
  modelsCache.clear()
}

export function setCompatibleModelsCache(
  pluginName: string,
  models: readonly string[],
  apiUrl: string
): void {
  const cleaned = Array.from(
    new Set(
      models
        .map((m) => (typeof m === "string" ? m.trim() : ""))
        .filter((m) => m.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b))
  modelsCache.set(pluginName, {
    models: cleaned,
    apiUrl: (apiUrl ?? "").trim(),
    fetchedAt: Date.now()
  })
}

/**
 * 读取缓存。若传入 expectedApiUrl 且与缓存 URL 不一致则返回 null（避免串台）。
 */
export function getCompatibleModelsCache(
  pluginName: string,
  expectedApiUrl?: string
): string[] | null {
  const entry = modelsCache.get(pluginName)
  if (!entry) return null
  if (expectedApiUrl != null) {
    const expected = expectedApiUrl.trim()
    if (expected && entry.apiUrl && entry.apiUrl !== expected) {
      return null
    }
  }
  return [...entry.models]
}
