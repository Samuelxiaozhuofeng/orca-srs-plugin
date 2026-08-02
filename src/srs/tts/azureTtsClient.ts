/**
 * Azure Speech REST TTS 客户端（无 SDK 依赖）。
 *
 * POST {endpoint}/cognitiveservices/v1
 * Headers: Ocp-Apim-Subscription-Key, Content-Type: application/ssml+xml,
 *          X-Microsoft-OutputFormat, User-Agent
 */

import { sanitizePublicError } from "../http/redactSecrets"
import {
  assertContentLengthWithin,
  ResponseBodyUnreadableError,
  ResponseTooLargeError
} from "../http/safeResponse"
import {
  backoffDelayMs,
  delayWithAbort,
  parseRetryAfterMs
} from "../ai/aiChatPolicy"
import {
  DEFAULT_TTS_OUTPUT_FORMAT,
  resolveTtsSynthesizeUrl,
  type TtsSettings
} from "./ttsSettingsSchema"

/** 输入文本字符上限（防误计费与超大 SSML） */
export const TTS_MAX_INPUT_CHARS = 2_000

/** 响应音频字节上限（约 5MB） */
export const TTS_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

/** 最小可接受 MP3 字节（空/极短响应视为失败） */
export const TTS_MIN_AUDIO_BYTES = 32

/** 默认请求超时 */
export const TTS_REQUEST_TIMEOUT_MS = 30_000

/** 429 最多额外重试次数（不含首次） */
export const TTS_MAX_RETRIES_429 = 2

export const TTS_USER_AGENT = "orca-srs-plugin/tts"

export type TtsClientErrorCode =
  | "NO_API_KEY"
  | "EMPTY_TEXT"
  | "TEXT_TOO_LONG"
  | "CANCELLED"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "EMPTY_BODY"
  | "INVALID_CONTENT_TYPE"
  | "INVALID_AUDIO"
  | "RESPONSE_TOO_LARGE"
  | "NETWORK_ERROR"

export class TtsClientError extends Error {
  readonly code: TtsClientErrorCode
  readonly status?: number
  readonly step: string

  constructor(
    code: TtsClientErrorCode,
    message: string,
    options?: { status?: number; step?: string }
  ) {
    super(message)
    this.name = "TtsClientError"
    this.code = code
    this.status = options?.status
    this.step = options?.step ?? "request"
  }
}

export type SynthesizeSpeechOptions = {
  settings: TtsSettings
  text: string
  signal?: AbortSignal
  /** 测试注入 */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxRetries429?: number
}

export type SynthesizeSpeechResult = {
  audio: ArrayBuffer
  contentType: string
  format: string
  voice: string
  byteLength: number
}

/** XML 特殊字符转义，防止 SSML 注入 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * 从 voice 名称粗略推断 xml:lang（Azure 神经语音通常以 BCP-47 开头）。
 * 无法推断时默认 zh-CN。
 */
export function inferLangFromVoice(voice: string): string {
  const m = /^([a-z]{2,3}-[A-Z]{2})/.exec(voice.trim())
  if (m) return m[1]
  return "zh-CN"
}

export function buildSsml(params: {
  text: string
  voice: string
  rate: string
  pitch: string
  lang?: string
}): string {
  const voice = escapeXml(params.voice.trim())
  const lang = escapeXml(params.lang ?? inferLangFromVoice(params.voice))
  const rate = escapeXml(params.rate.trim() || "0%")
  const pitch = escapeXml(params.pitch.trim() || "0%")
  const text = escapeXml(params.text)
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}">` +
    `<prosody rate="${rate}" pitch="${pitch}">${text}</prosody>` +
    `</voice></speak>`
  )
}

/**
 * 校验是否像 MP3：支持 MPEG 帧同步头或 ID3 标签头。
 * 不依赖扩展名；用户样本若是 AAC-in-MP4 命名 mp3 时，Content-Type 与头校验会拒绝。
 */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false
  // ID3v2
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true
  }
  // MPEG audio frame sync: 0xFF Ex
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true
  }
  return false
}

/** 允许的 Azure / 通用音频 Content-Type 子串（大小写不敏感） */
const ALLOWED_CONTENT_TYPE_SNIPPETS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mpeg3",
  "application/octet-stream"
]

export function isAllowedAudioContentType(contentType: string | null): boolean {
  if (contentType == null || contentType.trim() === "") {
    // Azure 有时省略 Content-Type；后续靠魔数兜底
    return true
  }
  const lower = contentType.toLowerCase()
  return ALLOWED_CONTENT_TYPE_SNIPPETS.some((s) => lower.includes(s))
}

/**
 * 有界读取 ArrayBuffer：优先 stream + 硬上限；无 stream 时 Content-Length 预检后 arrayBuffer。
 */
export async function readResponseArrayBufferLimited(
  response: Response,
  maxBytes: number
): Promise<ArrayBuffer> {
  assertContentLengthWithin(response, maxBytes)

  const body = response.body
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > maxBytes) {
          try {
            await reader.cancel()
          } catch (error) {
            console.warn("[Azure TTS] 超限后取消响应流失败:", error)
          }
          throw new ResponseTooLargeError(
            `响应体超过上限（>${maxBytes} 字节）`,
            maxBytes,
            total
          )
        }
        chunks.push(value)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch (error) {
        console.warn("[Azure TTS] 释放响应流锁失败:", error)
      }
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.byteLength
    }
    return out.buffer
  }

  // 无 stream：仅在 Content-Length 已预检通过时允许 arrayBuffer（与 safeResponse 文本路径不同，
  // 音频响应在部分测试 mock 无 body reader）。
  const cl = response.headers?.get?.("content-length")
  if (cl == null || cl === "") {
    throw new ResponseBodyUnreadableError(
      "响应缺少可读流且无 Content-Length，拒绝无界缓冲"
    )
  }
  const buffered = await response.arrayBuffer()
  if (buffered.byteLength > maxBytes) {
    throw new ResponseTooLargeError(
      `响应体超过上限（>${maxBytes} 字节）`,
      maxBytes,
      buffered.byteLength
    )
  }
  return buffered
}

function redact(message: string, apiKey: string): string {
  return sanitizePublicError(message, apiKey)
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = (error as { name?: string }).name
  return name === "AbortError" || name === "TimeoutError"
}

/**
 * 调用 Azure Speech REST 合成语音，返回校验过的 MP3 字节。
 */
export async function synthesizeSpeech(
  options: SynthesizeSpeechOptions
): Promise<SynthesizeSpeechResult> {
  const settings = options.settings
  const apiKey = settings.apiKey.trim()
  if (!apiKey) {
    throw new TtsClientError("NO_API_KEY", "未配置 Azure TTS API Key", {
      step: "config"
    })
  }

  const text = options.text.trim()
  if (!text) {
    throw new TtsClientError("EMPTY_TEXT", "合成文本为空", { step: "config" })
  }
  if (text.length > TTS_MAX_INPUT_CHARS) {
    throw new TtsClientError(
      "TEXT_TOO_LONG",
      `合成文本过长（${text.length} > ${TTS_MAX_INPUT_CHARS} 字符）`,
      { step: "config" }
    )
  }

  if (options.signal?.aborted) {
    throw new TtsClientError("CANCELLED", "已取消语音合成", { step: "request" })
  }

  const url = resolveTtsSynthesizeUrl(settings)
  const format = settings.format || DEFAULT_TTS_OUTPUT_FORMAT
  const ssml = buildSsml({
    text,
    voice: settings.voice,
    rate: settings.rate,
    pitch: settings.pitch
  })

  const timeoutMs = options.timeoutMs ?? TTS_REQUEST_TIMEOUT_MS
  const maxRetries = options.maxRetries429 ?? TTS_MAX_RETRIES_429
  const fetchImpl = options.fetchImpl ?? fetch

  let attempt = 0
  while (true) {
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    options.signal?.addEventListener("abort", onExternalAbort)

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(
          new TtsClientError("TIMEOUT", `语音合成超时（${timeoutMs}ms）`, {
            step: "request"
          })
        )
      }, timeoutMs)
    })

    try {
      const response = await Promise.race([
        fetchImpl(url, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": apiKey,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": format,
            "User-Agent": TTS_USER_AGENT
          },
          body: ssml,
          signal: controller.signal
        }),
        timeoutPromise
      ])

      if (!response.ok) {
        const status = response.status
        let detail = ""
        try {
          // 错误体只读有限字节，且绝不回显完整响应
          const errBuf = await readResponseArrayBufferLimited(response, 2_048)
          if (errBuf) {
            detail = new TextDecoder("utf-8", { fatal: false })
              .decode(new Uint8Array(errBuf))
              .slice(0, 200)
          }
        } catch (error) {
          console.warn("[Azure TTS] 读取有限错误响应失败，将仅报告状态码:", error)
        }

        if (status === 401 || status === 403) {
          throw new TtsClientError(
            "HTTP_ERROR",
            redact(
              `Azure TTS 鉴权失败（HTTP ${status}）。请检查 API Key 与区域。`,
              apiKey
            ),
            { status, step: "request" }
          )
        }

        if (status === 429 && attempt < maxRetries) {
          const retryAfter = parseRetryAfterMs(
            response.headers?.get?.("retry-after"),
            Date.now()
          )
          const waitMs = retryAfter ?? backoffDelayMs(attempt)
          attempt += 1
          await delayWithAbort(waitMs, options.signal)
          continue
        }

        const msg = detail
          ? `Azure TTS 请求失败（HTTP ${status}）：${detail}`
          : `Azure TTS 请求失败（HTTP ${status}）`
        throw new TtsClientError("HTTP_ERROR", redact(msg, apiKey), {
          status,
          step: "request"
        })
      }

      const contentType = response.headers?.get?.("content-type") ?? ""
      if (!isAllowedAudioContentType(contentType)) {
        throw new TtsClientError(
          "INVALID_CONTENT_TYPE",
          `响应 Content-Type 不是可接受的音频类型：${contentType || "(空)"}`,
          { step: "validate" }
        )
      }

      let audio: ArrayBuffer
      try {
        audio = await readResponseArrayBufferLimited(
          response,
          TTS_MAX_RESPONSE_BYTES
        )
      } catch (error) {
        if (error instanceof ResponseTooLargeError) {
          throw new TtsClientError(
            "RESPONSE_TOO_LARGE",
            error.message,
            { step: "validate" }
          )
        }
        if (error instanceof ResponseBodyUnreadableError) {
          throw new TtsClientError("EMPTY_BODY", error.message, {
            step: "validate"
          })
        }
        throw error
      }

      if (!audio || audio.byteLength === 0) {
        throw new TtsClientError("EMPTY_BODY", "Azure TTS 返回空音频", {
          step: "validate"
        })
      }
      if (audio.byteLength < TTS_MIN_AUDIO_BYTES) {
        throw new TtsClientError(
          "INVALID_AUDIO",
          `音频过短（${audio.byteLength} 字节）`,
          { step: "validate" }
        )
      }

      const bytes = new Uint8Array(audio)
      if (!looksLikeMp3(bytes)) {
        throw new TtsClientError(
          "INVALID_AUDIO",
          "响应不是有效的 MP3（缺少 ID3/MPEG 帧头）。请确认输出格式为 audio-*-mp3。",
          { step: "validate" }
        )
      }

      return {
        audio,
        contentType: contentType || "audio/mpeg",
        format,
        voice: settings.voice,
        byteLength: audio.byteLength
      }
    } catch (error) {
      if (error instanceof TtsClientError) throw error
      if (options.signal?.aborted || isAbortError(error)) {
        throw new TtsClientError("CANCELLED", "已取消语音合成", {
          step: "request"
        })
      }
      const raw =
        error instanceof Error ? error.message : String(error ?? "网络错误")
      throw new TtsClientError(
        "NETWORK_ERROR",
        redact(`Azure TTS 网络错误：${raw}`, apiKey),
        { step: "request" }
      )
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId)
      options.signal?.removeEventListener("abort", onExternalAbort)
    }
  }
}
