/**
 * Image MIME sniffing for EPUB assets (magic bytes).
 * SVG is rejected by policy (no extension trust).
 */

export type SniffedImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | null

const EXT_TO_MIME: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
  // .svg intentionally omitted — default reject
}

export function extensionImageMime(path: string): string | null {
  const pathWithoutQuery = path.split(/[?#]/)[0].toLowerCase()
  if (pathWithoutQuery.endsWith(".svg")) return null
  const extension = Object.keys(EXT_TO_MIME).find((ext) =>
    pathWithoutQuery.endsWith(ext)
  )
  return extension ? EXT_TO_MIME[extension] : null
}

export function sniffImageMime(data: ArrayBuffer): SniffedImageMime {
  const bytes = new Uint8Array(data)
  if (bytes.length < 12) return null

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }

  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif"
  }

  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }

  // AVIF: ftyp....avif / avis (ISO BMFF)
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (brand === "avif" || brand === "avis" || brand === "mif1") {
      // mif1 may be HEIF; only accept when avif brand also present later — first release: require avif/avis
      if (brand === "avif" || brand === "avis") return "image/avif"
      // scan minor brands
      const head = String.fromCharCode(...bytes.slice(8, Math.min(bytes.length, 32)))
      if (head.includes("avif") || head.includes("avis")) return "image/avif"
    }
  }

  return null
}

/**
 * Resolve upload MIME: extension must match sniffed magic when both present.
 * Returns null when rejected (SVG, mismatch, unknown).
 */
export function resolveImageUploadMime(
  path: string,
  data: ArrayBuffer
): { mime: string } | { reject: string } {
  const extMime = extensionImageMime(path)
  if (!extMime) {
    if (path.toLowerCase().split(/[?#]/)[0].endsWith(".svg")) {
      return { reject: "svg_rejected" }
    }
    return { reject: "unknown_extension" }
  }

  const sniffed = sniffImageMime(data)
  if (!sniffed) {
    return { reject: "magic_unknown" }
  }

  // apng declared as image/apng but sniffs as png — accept as image/png
  if (extMime === "image/apng" && sniffed === "image/png") {
    return { mime: "image/png" }
  }

  if (extMime !== sniffed && !(extMime === "image/jpeg" && sniffed === "image/jpeg")) {
    // jpeg/jpg already same; treat mismatch as reject
    if (normalizeMime(extMime) !== sniffed) {
      return { reject: "mime_mismatch" }
    }
  }

  return { mime: sniffed }
}

function normalizeMime(mime: string): string {
  if (mime === "image/apng") return "image/png"
  return mime
}
