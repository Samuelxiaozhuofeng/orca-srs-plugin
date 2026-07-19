/**
 * Central EPUB resource budgets (first-release defaults from 发布前优化 WP-07).
 * Pure validators — no Orca I/O.
 */

export const EPUB_LIMITS = {
  /** Compressed source file size before arrayBuffer / ZIP load. */
  maxCompressedBytes: 100 * 1024 * 1024,
  /** Maximum ZIP entry count after load. */
  maxZipEntries: 10_000,
  /** Cumulative decompressed payload actually read. */
  maxDecompressedBytes: 512 * 1024 * 1024,
  /** Single XHTML/HTML chapter body. */
  maxXhtmlBytes: 8 * 1024 * 1024,
  /** Single image asset. */
  maxImageBytes: 20 * 1024 * 1024,
  /** Spine HTML/XHTML chapter count. */
  maxChapters: 2_000,
  /** decompressed / compressed hard ratio (ZIP bomb guard). */
  maxCompressionRatio: 100
} as const

export type EpubLimitKey = keyof typeof EPUB_LIMITS

export class EpubBudgetError extends Error {
  readonly code: string
  readonly limitKey: EpubLimitKey
  readonly actual: number
  readonly limit: number

  constructor(
    message: string,
    limitKey: EpubLimitKey,
    actual: number,
    limit: number,
    code = "budget_exceeded"
  ) {
    super(message)
    this.name = "EpubBudgetError"
    this.code = code
    this.limitKey = limitKey
    this.actual = actual
    this.limit = limit
  }
}

export function assertEpubCompressedSize(byteLength: number): void {
  const limit = EPUB_LIMITS.maxCompressedBytes
  if (byteLength > limit) {
    throw new EpubBudgetError(
      `EPUB 文件过大（${formatMiB(byteLength)} > ${formatMiB(limit)}）`,
      "maxCompressedBytes",
      byteLength,
      limit
    )
  }
}

export function assertFileSizeBeforeRead(file: { size: number; name?: string }): void {
  assertEpubCompressedSize(file.size)
}

export function assertZipEntryCount(entryCount: number): void {
  const limit = EPUB_LIMITS.maxZipEntries
  if (entryCount > limit) {
    throw new EpubBudgetError(
      `EPUB ZIP 条目过多（${entryCount} > ${limit}）`,
      "maxZipEntries",
      entryCount,
      limit
    )
  }
}

export function assertChapterCount(count: number): void {
  const limit = EPUB_LIMITS.maxChapters
  if (count > limit) {
    throw new EpubBudgetError(
      `EPUB 章节过多（${count} > ${limit}）`,
      "maxChapters",
      count,
      limit
    )
  }
}

export function assertXhtmlSize(byteLength: number, href?: string): void {
  const limit = EPUB_LIMITS.maxXhtmlBytes
  if (byteLength > limit) {
    throw new EpubBudgetError(
      `章节 HTML 过大${href ? `（${href}）` : ""}：${formatMiB(byteLength)} > ${formatMiB(limit)}`,
      "maxXhtmlBytes",
      byteLength,
      limit
    )
  }
}

export function assertImageSize(byteLength: number, pathHint?: string): void {
  const limit = EPUB_LIMITS.maxImageBytes
  if (byteLength > limit) {
    throw new EpubBudgetError(
      `图片过大${pathHint ? `（${pathHint}）` : ""}：${formatMiB(byteLength)} > ${formatMiB(limit)}`,
      "maxImageBytes",
      byteLength,
      limit
    )
  }
}

/**
 * Tracks cumulative decompressed bytes and compression ratio vs source size.
 */
export class DecompressedBudgetTracker {
  private total = 0

  constructor(private readonly compressedBytes: number) {}

  get totalBytes(): number {
    return this.total
  }

  add(byteLength: number, label?: string): void {
    if (!Number.isFinite(byteLength) || byteLength < 0) {
      throw new EpubBudgetError(
        `无效的解压字节数${label ? `（${label}）` : ""}`,
        "maxDecompressedBytes",
        byteLength,
        EPUB_LIMITS.maxDecompressedBytes,
        "budget_invalid"
      )
    }
    this.total += byteLength
    const maxDec = EPUB_LIMITS.maxDecompressedBytes
    if (this.total > maxDec) {
      throw new EpubBudgetError(
        `EPUB 累计解压体积超限（${formatMiB(this.total)} > ${formatMiB(maxDec)}）`,
        "maxDecompressedBytes",
        this.total,
        maxDec
      )
    }
    if (this.compressedBytes > 0) {
      const ratio = this.total / this.compressedBytes
      const maxRatio = EPUB_LIMITS.maxCompressionRatio
      if (ratio > maxRatio) {
        throw new EpubBudgetError(
          `EPUB 压缩比异常（${ratio.toFixed(1)}:1 > ${maxRatio}:1），疑似 ZIP bomb`,
          "maxCompressionRatio",
          ratio,
          maxRatio,
          "budget_compression_ratio"
        )
      }
    }
  }
}

export function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

export function throwIfAborted(signal?: AbortSignal, message = "已取消 EPUB 操作"): void {
  if (signal?.aborted) {
    const err = new Error(message) as Error & { code: string }
    err.name = "AbortError"
    err.code = "aborted"
    throw err
  }
}

/** True when the error is cancel/budget and must not be soft-swallowed. */
export function isHardEpubControlError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  if (error instanceof EpubBudgetError) return true
  if ("limitKey" in error) return true
  const name = (error as { name?: string }).name
  const code = (error as { code?: string }).code
  if (name === "AbortError" || code === "aborted") return true
  if (
    code === "budget_exceeded" ||
    code === "budget_compression_ratio" ||
    code === "budget_invalid"
  ) {
    return true
  }
  return false
}

/**
 * Yield a browser macrotask so cancel handlers / paint can run.
 * `await Promise.resolve()` does NOT yield the main thread.
 */
export function yieldToMain(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        throwIfAborted(signal)
        resolve()
      } catch (error) {
        reject(error)
      }
    }, 0)
  })
}
