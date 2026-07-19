/**
 * Non-critical IR reader theme preference (localStorage).
 * Failures must not crash the session.
 */

export type IRReaderTheme = "mint" | "sepia" | "academic"

export const IR_READER_THEME_STORAGE_KEY = "orca-ir-reader-theme"
export const IR_READER_THEME_DEFAULT: IRReaderTheme = "mint"

export function parseIRReaderTheme(raw: string | null | undefined): IRReaderTheme {
  if (raw === "sepia" || raw === "academic" || raw === "mint") return raw
  return IR_READER_THEME_DEFAULT
}

export type ThemeStorageResult =
  | { ok: true; theme: IRReaderTheme }
  | { ok: false; theme: IRReaderTheme; error: unknown }

export function readIRReaderTheme(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage
): ThemeStorageResult {
  try {
    if (!storage) {
      return { ok: false, theme: IR_READER_THEME_DEFAULT, error: new Error("localStorage unavailable") }
    }
    const theme = parseIRReaderTheme(storage.getItem(IR_READER_THEME_STORAGE_KEY))
    return { ok: true, theme }
  } catch (error) {
    return { ok: false, theme: IR_READER_THEME_DEFAULT, error }
  }
}

export function writeIRReaderTheme(
  theme: IRReaderTheme,
  storage: Pick<Storage, "setItem"> | null | undefined = globalThis.localStorage
): ThemeStorageResult {
  try {
    if (!storage) {
      return { ok: false, theme, error: new Error("localStorage unavailable") }
    }
    storage.setItem(IR_READER_THEME_STORAGE_KEY, theme)
    return { ok: true, theme }
  } catch (error) {
    return { ok: false, theme, error }
  }
}
