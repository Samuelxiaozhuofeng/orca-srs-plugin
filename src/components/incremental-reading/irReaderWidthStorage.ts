/**
 * Non-critical IR reader content width preference (localStorage).
 * Failures must not crash the session.
 */

export const IR_READER_WIDTH_STORAGE_KEY = "orca-ir-reader-content-width"
/** Default body max-width in reading mode (px). */
export const IR_READER_WIDTH_DEFAULT = 820
export const IR_READER_WIDTH_MIN = 480
export const IR_READER_WIDTH_MAX = 1400
/** Preset chips shown in「更多操作」. */
export const IR_READER_WIDTH_PRESETS = [720, 820, 960, 1080] as const

export function clampIRReaderWidth(px: number): number {
  if (!Number.isFinite(px)) return IR_READER_WIDTH_DEFAULT
  const rounded = Math.round(px)
  if (rounded < IR_READER_WIDTH_MIN) return IR_READER_WIDTH_MIN
  if (rounded > IR_READER_WIDTH_MAX) return IR_READER_WIDTH_MAX
  return rounded
}

export function parseIRReaderWidth(raw: string | null | undefined): number {
  if (raw == null || raw === "") return IR_READER_WIDTH_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return IR_READER_WIDTH_DEFAULT
  return clampIRReaderWidth(n)
}

/**
 * Parse custom-width draft from the more-panel input.
 * Returns null for empty/invalid drafts (caller should restore current width).
 * Note: Number("") is 0 in JS — must treat blank as invalid, not 480.
 */
export function parseIRReaderWidthDraft(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return clampIRReaderWidth(n)
}

export type WidthStorageResult =
  | { ok: true; width: number }
  | { ok: false; width: number; error: unknown }

/**
 * Read preference. `storage` defaults to localStorage resolved **inside** try
 * (default-param evaluation of `globalThis.localStorage` can throw SecurityError
 * before the try body runs).
 */
export function readIRReaderWidth(
  storage?: Pick<Storage, "getItem"> | null
): WidthStorageResult {
  try {
    const store = storage !== undefined ? storage : globalThis.localStorage
    if (!store) {
      return {
        ok: false,
        width: IR_READER_WIDTH_DEFAULT,
        error: new Error("localStorage unavailable")
      }
    }
    const width = parseIRReaderWidth(store.getItem(IR_READER_WIDTH_STORAGE_KEY))
    return { ok: true, width }
  } catch (error) {
    return { ok: false, width: IR_READER_WIDTH_DEFAULT, error }
  }
}

export function writeIRReaderWidth(
  width: number,
  storage?: Pick<Storage, "setItem"> | null
): WidthStorageResult {
  const clamped = clampIRReaderWidth(width)
  try {
    const store = storage !== undefined ? storage : globalThis.localStorage
    if (!store) {
      return {
        ok: false,
        width: clamped,
        error: new Error("localStorage unavailable")
      }
    }
    store.setItem(IR_READER_WIDTH_STORAGE_KEY, String(clamped))
    return { ok: true, width: clamped }
  } catch (error) {
    return { ok: false, width: clamped, error }
  }
}
