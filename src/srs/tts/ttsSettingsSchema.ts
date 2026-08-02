/**
 * Azure TTS 连接设置：独立 plugin data 键，不复用 AI / Firecrawl 配置。
 */

/** plugin data 键（与 ai.connection 等隔离） */
export const TTS_CONNECTION_DATA_KEY = "tts.connection" as const

export const TTS_PROVIDERS = ["azure"] as const
export type TtsProvider = (typeof TTS_PROVIDERS)[number]

/** Azure 输出格式：固定默认，避免用户误选导致校验失败 */
export const DEFAULT_TTS_OUTPUT_FORMAT =
  "audio-24khz-96kbitrate-mono-mp3" as const

export const DEFAULT_TTS_VOICE = "zh-CN-XiaoxiaoNeural"
export const DEFAULT_TTS_REGION = "eastasia"
export const DEFAULT_TTS_RATE = "0%"
export const DEFAULT_TTS_PITCH = "0%"

/** region 允许字符：字母数字与连字符 */
const REGION_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i

export interface TtsSettings {
  provider: TtsProvider
  /**
   * Azure Speech 区域（如 eastasia）。
   * 与 endpoint 二选一优先：若 endpoint 非空且合法则用 endpoint，否则用 region。
   */
  region: string
  /**
   * 可选自定义 HTTPS endpoint（资源级，不含 path）。
   * 例：https://eastasia.tts.speech.microsoft.com
   * 空字符串表示不使用。
   */
  endpoint: string
  apiKey: string
  voice: string
  format: string
  /** SSML prosody rate，如 0% / +10% / -5% */
  rate: string
  /** SSML prosody pitch，如 0% / +2st */
  pitch: string
}

type CacheEntry = { value: TtsSettings }

const ttsSettingsCache = new Map<string, CacheEntry>()

export function clearTtsSettingsCache(pluginName?: string): void {
  if (pluginName) {
    ttsSettingsCache.delete(pluginName)
    return
  }
  ttsSettingsCache.clear()
}

function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * 校验并规范化 endpoint：仅允许 HTTPS，去掉尾部斜杠。
 * 非法值回退为空串（调用方用 region）。
 */
export function normalizeTtsEndpoint(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  if (!isHttpsUrl(trimmed)) return ""
  return trimmed
}

export function normalizeTtsRegion(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_TTS_REGION
  const trimmed = value.trim()
  if (!trimmed || !REGION_RE.test(trimmed)) return DEFAULT_TTS_REGION
  return trimmed.toLowerCase()
}

export function normalizeTtsSettings(
  input: Partial<TtsSettings> | null | undefined
): TtsSettings {
  const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : ""
  const voiceRaw = typeof input?.voice === "string" ? input.voice.trim() : ""
  const rateRaw = typeof input?.rate === "string" ? input.rate.trim() : ""
  const pitchRaw = typeof input?.pitch === "string" ? input.pitch.trim() : ""
  // provider 首版固定 Azure；未知值归一为 azure
  const provider: TtsProvider = "azure"

  return {
    provider,
    region: normalizeTtsRegion(input?.region),
    endpoint: normalizeTtsEndpoint(input?.endpoint),
    apiKey,
    voice: voiceRaw || DEFAULT_TTS_VOICE,
    format: DEFAULT_TTS_OUTPUT_FORMAT,
    rate: rateRaw || DEFAULT_TTS_RATE,
    pitch: pitchRaw || DEFAULT_TTS_PITCH
  }
}

export function getTtsSettings(pluginName: string): TtsSettings {
  const cached = ttsSettingsCache.get(pluginName)
  if (cached) return { ...cached.value }
  return normalizeTtsSettings({})
}

/**
 * 仅更新内存缓存（不写 setData）。
 * 用于「测试连接」草稿；调用方须在 finally 中恢复或重新 hydrate。
 */
export function setTtsSettingsCache(
  pluginName: string,
  value: Partial<TtsSettings>
): void {
  ttsSettingsCache.set(pluginName, { value: normalizeTtsSettings(value) })
}

export function isTtsConfigured(pluginName: string): boolean {
  const s = getTtsSettings(pluginName)
  return s.apiKey.length > 0 && (s.endpoint.length > 0 || s.region.length > 0)
}

/**
 * 解析 REST 合成 URL（不含 query）。
 * endpoint 优先；否则 `https://{region}.tts.speech.microsoft.com`。
 */
export function resolveTtsSynthesizeUrl(settings: TtsSettings): string {
  const base =
    settings.endpoint.length > 0
      ? settings.endpoint
      : `https://${settings.region}.tts.speech.microsoft.com`
  return `${base.replace(/\/+$/, "")}/cognitiveservices/v1`
}

function parseDataPayload(data: unknown): TtsSettings | null {
  if (data == null) return null
  if (typeof data !== "string") {
    throw new Error(
      `[TTS Settings] ${TTS_CONNECTION_DATA_KEY} 必须是 JSON 字符串`
    )
  }
  if (data.trim() === "") return null
  try {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("根值必须是对象")
    }
    return normalizeTtsSettings(parsed as Partial<TtsSettings>)
  } catch (error) {
    throw new Error(
      `[TTS Settings] ${TTS_CONNECTION_DATA_KEY} 解析失败：${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    )
  }
}

export async function hydrateTtsSettings(
  pluginName: string
): Promise<TtsSettings> {
  let data: unknown
  try {
    data = await orca.plugins.getData(pluginName, TTS_CONNECTION_DATA_KEY)
  } catch (error) {
    throw new Error(
      `[TTS Settings] 读取 ${TTS_CONNECTION_DATA_KEY} 失败：${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    )
  }

  const fromData = parseDataPayload(data)

  if (fromData) {
    ttsSettingsCache.set(pluginName, { value: fromData })
    return { ...fromData }
  }

  const defaults = normalizeTtsSettings({})
  ttsSettingsCache.set(pluginName, { value: defaults })
  return { ...defaults }
}

/**
 * 写入 TTS 连接设置到 plugin data。
 * setData 失败会抛出，不得假装成功。
 */
export async function saveTtsSettings(
  pluginName: string,
  next: Partial<TtsSettings>
): Promise<TtsSettings> {
  const cleaned = normalizeTtsSettings(next)
  await orca.plugins.setData(
    pluginName,
    TTS_CONNECTION_DATA_KEY,
    JSON.stringify(cleaned)
  )
  ttsSettingsCache.set(pluginName, { value: cleaned })
  return { ...cleaned }
}
