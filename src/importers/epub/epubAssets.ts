/**
 * EPUB image asset upload with path cache, MIME magic checks, and budget limits.
 */

import type JSZip from "jszip"
import {
  assertImageSize,
  type DecompressedBudgetTracker
} from "./epubLimits"
import { resolveImageUploadMime } from "./epubMime"

export class EpubAssetUploader {
  private readonly uploadedAssetPaths = new Map<string, string>()
  private omitReasons: Array<{ path: string; reason: string }> = []

  constructor(
    private readonly zip: JSZip,
    private readonly budget?: DecompressedBudgetTracker
  ) {}

  getOmitReasons(): ReadonlyArray<{ path: string; reason: string }> {
    return this.omitReasons
  }

  async uploadImage(
    src: string,
    htmlFilePath: string
  ): Promise<string | null> {
    // Security: never pass through external / data / blob / file URLs.
    if (isRejectedSrc(src)) {
      this.omitReasons.push({ path: src, reason: "rejected_src" })
      return null
    }

    const imagePath = resolveRelativePath(src, getDirname(htmlFilePath))
    const cachedPath = this.uploadedAssetPaths.get(imagePath)
    if (cachedPath) {
      return cachedPath
    }

    const file = this.zip.file(imagePath)
    if (!file) {
      this.omitReasons.push({ path: imagePath, reason: "missing_in_zip" })
      return null
    }

    const data = await file.async("arraybuffer")
    this.budget?.add(data.byteLength, imagePath)

    try {
      assertImageSize(data.byteLength, imagePath)
    } catch (error) {
      this.omitReasons.push({
        path: imagePath,
        reason: error instanceof Error ? error.message : "image_too_large"
      })
      return null
    }

    const resolved = resolveImageUploadMime(imagePath, data)
    if ("reject" in resolved) {
      this.omitReasons.push({ path: imagePath, reason: resolved.reject })
      return null
    }

    const assetPath = await orca.invokeBackend(
      "upload-asset-binary",
      resolved.mime,
      data
    )
    if (typeof assetPath !== "string" || assetPath.length === 0) {
      throw new Error(`Failed to upload EPUB image: ${imagePath}`)
    }

    this.uploadedAssetPaths.set(imagePath, assetPath)
    return assetPath
  }

  getCachedPaths(): ReadonlyMap<string, string> {
    return this.uploadedAssetPaths
  }
}

/** Upload original EPUB bytes for durable resume. */
export async function uploadSourceEpub(
  buffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  const assetPath = await orca.invokeBackend(
    "upload-asset-binary",
    "application/epub+zip",
    buffer
  )
  if (typeof assetPath !== "string" || assetPath.length === 0) {
    throw new Error(`Failed to upload source EPUB: ${fileName}`)
  }
  return assetPath
}

/** Reload source EPUB bytes from an uploaded asset path. */
export async function loadSourceEpubBuffer(sourceAssetPath: string): Promise<ArrayBuffer> {
  const path = orca.utils.getAssetPath(sourceAssetPath)
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`Failed to resolve EPUB asset path: ${sourceAssetPath}`)
  }

  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch source EPUB (${response.status}): ${sourceAssetPath}`)
  }
  return await response.arrayBuffer()
}

function getDirname(path: string): string {
  const index = path.lastIndexOf("/")
  if (index === -1) return ""
  return path.slice(0, index + 1)
}

function isRejectedSrc(src: string): boolean {
  const v = src.trim()
  if (!v) return true
  if (v.startsWith("//")) return true
  if (/^(data:|blob:|file:)/i.test(v)) return true
  // Any scheme (http, https, javascript, …) — local ZIP paths have no scheme.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return true
  return false
}

function resolveRelativePath(path: string, baseDir: string): string {
  const pathOnly = path.split(/[?#]/)[0]
  if (pathOnly.startsWith("/")) {
    return normalizePath(pathOnly.slice(1))
  }
  return normalizePath(baseDir + pathOnly)
}

function normalizePath(path: string): string {
  const resolved: string[] = []
  for (const part of path.split("/")) {
    if (part === "..") {
      resolved.pop()
    } else if (part !== "." && part !== "") {
      resolved.push(part)
    }
  }
  return resolved.join("/")
}
