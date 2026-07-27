/**
 * Chapter multi-select list for EPUB import / IR subset.
 * Import mode: optional preview pane + page/marker role per chapter.
 */

import type {
  EpubChapter,
  EpubChapterImportRole,
  EpubChapterPreview
} from "../../importers/epub/types"
import { accessibilityLabels } from "./epubImportViewModel"

const { useState, useCallback, useEffect, useRef } = window.React
const { Button } = orca.components

export type EpubChapterSelectorProps = {
  chapters: Array<
    Pick<EpubChapter, "key" | "title" | "spineIndex"> & { disabled?: boolean }
  >
  selectedKeys: string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  label?: string
  /**
   * When true, show page/marker role controls + preview panel (import wizard).
   * IR setup leaves this off (simple multi-select of chapter pages).
   */
  enableImportRoles?: boolean
  chapterRoles?: Record<string, EpubChapterImportRole>
  onChapterRolesChange?: (roles: Record<string, EpubChapterImportRole>) => void
  /** Lazy load plain-text preview for the focused chapter. */
  loadPreview?: (chapterKey: string) => Promise<EpubChapterPreview>
  onApplyMarkerSuggestions?: () => void
  suggesting?: boolean
}

export default function EpubChapterSelector({
  chapters,
  selectedKeys,
  onChange,
  disabled,
  label,
  enableImportRoles = false,
  chapterRoles = {},
  onChapterRolesChange,
  loadPreview,
  onApplyMarkerSuggestions,
  suggesting
}: EpubChapterSelectorProps) {
  const labels = accessibilityLabels()
  const selectedSet = new Set(selectedKeys)
  const [focusKey, setFocusKey] = useState<string | null>(
    chapters[0]?.key ?? null
  )
  const [preview, setPreview] = useState<EpubChapterPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewReqId = useRef(0)

  const focused = chapters.find((c) => c.key === focusKey) ?? null

  useEffect(() => {
    if (!enableImportRoles || !loadPreview || !focusKey) {
      setPreview(null)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }
    const req = ++previewReqId.current
    setPreviewLoading(true)
    setPreviewError(null)
    void loadPreview(focusKey)
      .then((p) => {
        if (previewReqId.current !== req) return
        setPreview(p)
        setPreviewLoading(false)
      })
      .catch((error: unknown) => {
        if (previewReqId.current !== req) return
        setPreview(null)
        setPreviewLoading(false)
        setPreviewError(error instanceof Error ? error.message : String(error))
      })
  }, [enableImportRoles, loadPreview, focusKey])

  const toggle = (key: string) => {
    if (disabled) return
    if (selectedSet.has(key)) {
      onChange(selectedKeys.filter((k) => k !== key))
    } else {
      onChange([...selectedKeys, key])
      if (enableImportRoles && onChapterRolesChange && !chapterRoles[key]) {
        onChapterRolesChange({ ...chapterRoles, [key]: "page" })
      }
    }
  }

  const setRole = useCallback(
    (key: string, role: EpubChapterImportRole) => {
      if (disabled || !onChapterRolesChange) return
      onChapterRolesChange({ ...chapterRoles, [key]: role })
      if (!selectedSet.has(key)) {
        onChange([...selectedKeys, key])
      }
    },
    [
      disabled,
      onChapterRolesChange,
      chapterRoles,
      selectedSet,
      onChange,
      selectedKeys
    ]
  )

  const selectAll = () => {
    if (disabled) return
    const keys = chapters.filter((c) => !c.disabled).map((c) => c.key)
    onChange(keys)
    if (enableImportRoles && onChapterRolesChange) {
      const next = { ...chapterRoles }
      for (const key of keys) {
        if (!next[key]) next[key] = "page"
      }
      onChapterRolesChange(next)
    }
  }

  const clearAll = () => {
    if (disabled) return
    onChange([])
  }

  const pageCount = selectedKeys.filter(
    (k) => (chapterRoles[k] ?? "page") === "page"
  ).length
  const markerCount = selectedKeys.filter(
    (k) => chapterRoles[k] === "marker"
  ).length

  return (
    <div
      role="group"
      aria-label={label || labels.chapterList}
      className={
        enableImportRoles
          ? "srs-chapter-selector srs-chapter-selector--with-preview"
          : "srs-chapter-selector"
      }
    >
      <div className="srs-chapter-selector__toolbar">
        <Button
          variant="outline"
          onClick={disabled ? undefined : selectAll}
          aria-disabled={disabled}
          className={disabled ? "srs-ui-locked" : undefined}
        >
          {labels.selectAll}
        </Button>
        <Button
          variant="outline"
          onClick={disabled ? undefined : clearAll}
          aria-disabled={disabled}
          className={disabled ? "srs-ui-locked" : undefined}
        >
          {labels.clearAll}
        </Button>
        {enableImportRoles && onApplyMarkerSuggestions ? (
          <Button
            variant="outline"
            onClick={
              disabled || suggesting ? undefined : () => onApplyMarkerSuggestions()
            }
            aria-disabled={disabled || suggesting}
            className={disabled || suggesting ? "srs-ui-locked" : undefined}
          >
            {suggesting ? "分析中…" : labels.suggestMarkers}
          </Button>
        ) : null}
        <span className="srs-chapter-selector__count">
          {enableImportRoles
            ? `已选 ${selectedKeys.length}/${chapters.length}（单独成页 ${pageCount} · 只作目录 ${markerCount}）`
            : `已选 ${selectedKeys.length}/${chapters.length}`}
        </span>
      </div>

      {enableImportRoles ? (
        <div className="srs-chapter-selector__hint">
          <p className="srs-chapter-selector__hint-line">
            <strong>怎么选：</strong>
            先点左边章节，看右边预览里有多少字。
          </p>
          <p className="srs-chapter-selector__hint-line">
            <strong>{labels.rolePage}：</strong>
            {labels.rolePageHint}
          </p>
          <p className="srs-chapter-selector__hint-line">
            <strong>{labels.roleMarker}：</strong>
            {labels.roleMarkerHint}
          </p>
          <p className="srs-chapter-selector__hint-line srs-chapter-selector__hint-line--muted">
            拿不准时：正文多就「单独成页」；像「第一部分…」只有几句话，就「只作目录」。也可点「把短内容改成『只作目录』」让程序先猜一版，再自己改。
          </p>
        </div>
      ) : null}

      <div
        className={
          enableImportRoles
            ? "srs-chapter-selector__body"
            : undefined
        }
      >
        <div className="srs-chapter-selector__list">
          {chapters.map((ch) => {
            const checked = selectedSet.has(ch.key)
            const itemDisabled = disabled || ch.disabled
            const role: EpubChapterImportRole = chapterRoles[ch.key] ?? "page"
            const isFocused = focusKey === ch.key
            return (
              <div
                key={ch.key}
                className={`srs-chapter-selector__item${
                  itemDisabled ? " srs-chapter-selector__item--disabled" : ""
                }${isFocused ? " srs-chapter-selector__item--focused" : ""}${
                  checked && role === "marker"
                    ? " srs-chapter-selector__item--marker"
                    : ""
                }`}
              >
                <label className="srs-chapter-selector__check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={itemDisabled}
                    aria-label={ch.title}
                    onChange={() => toggle(ch.key)}
                  />
                </label>
                <button
                  type="button"
                  className="srs-chapter-selector__main"
                  disabled={itemDisabled}
                  onClick={() => setFocusKey(ch.key)}
                >
                  <span className="srs-chapter-selector__label">
                    <span className="srs-chapter-selector__index">
                      {ch.spineIndex + 1}.
                    </span>
                    {ch.title}
                  </span>
                </button>
                {enableImportRoles && checked ? (
                  <div
                    className="srs-chapter-selector__roles"
                    role="group"
                    aria-label={`${ch.title}：导入成单独页面，还是只留目录标题`}
                  >
                    <button
                      type="button"
                      className={`srs-chapter-selector__role-btn${
                        role === "page"
                          ? " srs-chapter-selector__role-btn--active"
                          : ""
                      }`}
                      disabled={itemDisabled}
                      title={labels.rolePageHint}
                      onClick={() => setRole(ch.key, "page")}
                    >
                      {labels.rolePage}
                    </button>
                    <button
                      type="button"
                      className={`srs-chapter-selector__role-btn${
                        role === "marker"
                          ? " srs-chapter-selector__role-btn--active"
                          : ""
                      }`}
                      disabled={itemDisabled}
                      title={labels.roleMarkerHint}
                      onClick={() => setRole(ch.key, "marker")}
                    >
                      {labels.roleMarker}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {enableImportRoles ? (
          <aside
            className="srs-chapter-selector__preview"
            aria-label={labels.chapterPreview}
          >
            <div className="srs-chapter-selector__preview-title">
              {focused ? `预览：${focused.title}` : "右边看内容，再决定怎么导入"}
            </div>
            {previewLoading ? (
              <div className="srs-chapter-selector__preview-status">
                正在读取这一章的正文…
              </div>
            ) : null}
            {previewError ? (
              <div className="srs-chapter-selector__preview-error" role="alert">
                {previewError}
              </div>
            ) : null}
            {!previewLoading && !previewError && preview ? (
              <>
                <div className="srs-chapter-selector__preview-meta">
                  正文大约 {preview.charCount} 字
                  {preview.suggestedRole === "marker"
                    ? ` · 程序建议：${labels.roleMarker}（内容偏短，多半是分界标题）`
                    : ` · 程序建议：${labels.rolePage}（内容够读，适合单独一页）`}
                </div>
                <pre className="srs-chapter-selector__preview-text">
                  {preview.previewText}
                </pre>
                {focused && !disabled ? (
                  <div className="srs-chapter-selector__preview-actions">
                    <Button
                      variant="outline"
                      title={labels.rolePageHint}
                      onClick={() => setRole(focused.key, "page")}
                    >
                      用「{labels.rolePage}」
                    </Button>
                    <Button
                      variant="outline"
                      title={labels.roleMarkerHint}
                      onClick={() => setRole(focused.key, "marker")}
                    >
                      用「{labels.roleMarker}」
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
            {!previewLoading && !previewError && !preview ? (
              <div className="srs-chapter-selector__preview-status">
                点左边任意一章，这里会显示正文摘要，方便判断要「单独成页」还是「只作目录」。
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
