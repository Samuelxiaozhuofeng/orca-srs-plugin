/**
 * EPUB image asset upload with path cache.
 */

import type JSZip from "jszip"

const IMAGE_EXTENSIONS: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
}

export class EpubAssetUploader {
  private readonly uploadedAssetPaths = new Map<string, string>()

  constructor(private readonly zip: JSZip) {}

  async uploadImage(
    src: string,
    htmlFilePath: string
  ): Promise<string | null> {
    if (isExternalSrc(src) || src.startsWith("data:")) {
      return src
    }

    const imagePath = resolveRelativePath(src, getDirname(htmlFilePath))
    const mimeType = getImageMimeType(imagePath)
    if (!mimeType) {
      return null
    }

    const cachedPath = this.uploadedAssetPaths.get(imagePath)
    if (cachedPath) {
      return cachedPath
    }

    const file = this.zip.file(imagePath)
    if (!file) {
      throw new Error(`Image file not found in EPUB: ${imagePath}`)
    }

    const data = await file.async("arraybuffer")
    const assetPath = await orca.invokeBackend(
      "upload-asset-binary",
      mimeType,
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

function getImageMimeType(path: string): string | null {
  const pathWithoutQuery = path.split(/[?#]/)[0].toLowerCase()
  const extension = Object.keys(IMAGE_EXTENSIONS).find((ext) =>
    pathWithoutQuery.endsWith(ext)
  )
  return extension ? IMAGE_EXTENSIONS[extension] : null
}

function isExternalSrc(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")
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
