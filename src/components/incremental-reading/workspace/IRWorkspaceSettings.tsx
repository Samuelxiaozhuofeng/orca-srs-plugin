/**
 * 工作区设置与危险操作抽屉
 */

import {
  DEFAULT_IR_DAILY_LIMIT,
  DEFAULT_IR_TOPIC_QUOTA_PERCENT,
  getIncrementalReadingSettings,
  INCREMENTAL_READING_SETTINGS_KEYS,
  incrementalReadingSettingsSchema,
  type IncrementalReadingSettings
} from "../../../srs/settings/incrementalReadingSettingsSchema"
import { startAutoMarkExtract, stopAutoMarkExtract } from "../../../srs/incrementalReadingAutoMark"
import IRFunnelDiagnosticsPanel from "../IRFunnelDiagnosticsPanel"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { useIRDialogFocus } from "./useIRDialogFocus"
import IRWorkspaceDangerZone from "./IRWorkspaceDangerZone"

const { useCallback, useEffect, useState } = window.React
const { Button } = orca.components

type Props = {
  open: boolean
  pluginName: string
  cards: IRCard[]
  showDiagnostics?: boolean
  onClose: () => void
  onSettingsChanged?: () => void
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IR_TOPIC_QUOTA_PERCENT
  const rounded = Math.round(value)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

function normalizeDailyLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IR_DAILY_LIMIT
  const rounded = Math.round(value)
  if (rounded < 0) return 0
  return rounded
}

export default function IRWorkspaceSettings({
  open,
  pluginName,
  cards,
  showDiagnostics = false,
  onClose,
  onSettingsChanged
}: Props) {
  const dialogRef = useIRDialogFocus(open, onClose)
  const [settings, setSettings] = useState<IncrementalReadingSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [topicQuotaInput, setTopicQuotaInput] = useState("")
  const [dailyLimitInput, setDailyLimitInput] = useState("")

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const next = getIncrementalReadingSettings(pluginName)
      setSettings(next)
      setTopicQuotaInput(String(next.topicQuotaPercent))
      setDailyLimitInput(String(next.dailyLimit))
    } catch (error) {
      console.error("[IR Workspace] 加载设置失败:", error)
      orca.notify("error", "加载渐进阅读设置失败", { title: "渐进阅读" })
    } finally {
      setIsLoading(false)
    }
  }, [pluginName])

  useEffect(() => {
    if (!open) return
    void loadSettings()
  }, [open, loadSettings])

  const saveSettings = useCallback(async (
    patch: Partial<IncrementalReadingSettings>,
    options: { notify?: boolean } = {}
  ) => {
    if (!pluginName || Object.keys(patch).length === 0) return
    setIsSaving(true)
    try {
      const toSave: Record<string, unknown> = {}
      if (patch.enableAutoExtractMark !== undefined) {
        toSave[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark] = patch.enableAutoExtractMark
      }
      if (patch.topicQuotaPercent !== undefined) {
        toSave[INCREMENTAL_READING_SETTINGS_KEYS.topicQuotaPercent] = patch.topicQuotaPercent
      }
      if (patch.dailyLimit !== undefined) {
        toSave[INCREMENTAL_READING_SETTINGS_KEYS.dailyLimit] = patch.dailyLimit
      }
      if (patch.enableAutoDefer !== undefined) {
        toSave[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoDefer] = patch.enableAutoDefer
      }

      await orca.plugins.setSettings("app", pluginName, toSave)
      setSettings((prev: IncrementalReadingSettings | null) => ({
        ...(prev ?? getIncrementalReadingSettings(pluginName)),
        ...patch
      }))

      if (patch.enableAutoExtractMark !== undefined) {
        if (patch.enableAutoExtractMark) startAutoMarkExtract(pluginName)
        else stopAutoMarkExtract(pluginName)
      }

      if (options.notify) {
        orca.notify("success", "渐进阅读设置已保存", { title: "渐进阅读" })
      }
      onSettingsChanged?.()
    } catch (error) {
      console.error("[IR Workspace] 保存设置失败:", error)
      orca.notify("error", `保存渐进阅读设置失败: ${error}`, { title: "渐进阅读" })
    } finally {
      setIsSaving(false)
    }
  }, [pluginName, onSettingsChanged])

  const handleReset = useCallback(async () => {
    setIsResetting(true)
    try {
      const { resetIncrementalReadingData } = await import("../../../srs/incrementalReadingReset")
      const result = await resetIncrementalReadingData(pluginName, { disableAutoExtractMark: true })
      if (result.errors.length > 0) {
        orca.notify(
          "warn",
          `已清理 ${result.totalCleaned}/${result.totalFound} 个；失败 ${result.errors.length} 个`,
          { title: "渐进阅读" }
        )
      } else {
        orca.notify(
          "success",
          `已清理 ${result.totalCleaned} 个 Topic/Extracts`,
          { title: "渐进阅读" }
        )
      }
      await loadSettings()
      onSettingsChanged?.()
    } catch (error) {
      console.error("[IR Workspace] 清空 IR 数据失败:", error)
      orca.notify("error", `清空 IR 数据失败: ${error}`, { title: "渐进阅读" })
    } finally {
      setIsResetting(false)
    }
  }, [pluginName, loadSettings, onSettingsChanged])

  if (!open) return null

  const schemaDefaults = {
    enableAutoExtractMark:
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoExtractMark].defaultValue,
    topicQuotaPercent:
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.topicQuotaPercent].defaultValue,
    dailyLimit:
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.dailyLimit].defaultValue,
    enableAutoDefer:
      incrementalReadingSettingsSchema[INCREMENTAL_READING_SETTINGS_KEYS.enableAutoDefer].defaultValue
  } satisfies IncrementalReadingSettings

  const busy = isSaving || isResetting

  return (
    <div className="ir-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        ref={dialogRef}
        className="ir-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={showDiagnostics ? "漏斗诊断" : "渐进阅读设置"}
        tabIndex={-1}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <div className="ir-drawer__header">
          <div className="ir-drawer__title">{showDiagnostics ? "漏斗诊断" : "设置"}</div>
          <button
            type="button"
            className="ir-icon-btn"
            aria-label="关闭设置"
            title="关闭"
            onClick={onClose}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div className="ir-drawer__body" style={busy ? { opacity: 0.65, pointerEvents: "none" } : undefined}>
          {showDiagnostics ? (
            <IRFunnelDiagnosticsPanel cards={cards} />
          ) : isLoading || !settings ? (
            <div className="ir-drawer__hint">加载设置中…</div>
          ) : (
            <>
              <div className="ir-drawer__field">
                <label htmlFor="ir-setting-auto-extract">自动标签 Extract</label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
                  <input
                    id="ir-setting-auto-extract"
                    type="checkbox"
                    checked={settings.enableAutoExtractMark}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      void saveSettings(
                        { enableAutoExtractMark: event.currentTarget.checked },
                        { notify: true }
                      )
                    }}
                  />
                  <span>Topic 子块自动标记为 Extract</span>
                </label>
              </div>

              <div className="ir-drawer__field">
                <label htmlFor="ir-setting-topic-quota">Topic 配额比例（%）</label>
                <input
                  id="ir-setting-topic-quota"
                  type="number"
                  min={0}
                  max={100}
                  value={topicQuotaInput}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setTopicQuotaInput(event.currentTarget.value)
                  }}
                  onBlur={() => {
                    const next = normalizePercent(Number(topicQuotaInput))
                    setTopicQuotaInput(String(next))
                    if (next !== settings.topicQuotaPercent) {
                      void saveSettings({ topicQuotaPercent: next })
                    }
                  }}
                />
              </div>

              <div className="ir-drawer__field">
                <label htmlFor="ir-setting-daily-limit">每日上限</label>
                <input
                  id="ir-setting-daily-limit"
                  type="number"
                  min={0}
                  value={dailyLimitInput}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setDailyLimitInput(event.currentTarget.value)
                  }}
                  onBlur={() => {
                    const next = normalizeDailyLimit(Number(dailyLimitInput))
                    setDailyLimitInput(String(next))
                    if (next !== settings.dailyLimit) {
                      void saveSettings({ dailyLimit: next })
                    }
                  }}
                />
                <div className="ir-drawer__hint">0 表示不限制（默认 {DEFAULT_IR_DAILY_LIMIT}）</div>
              </div>

              <div className="ir-drawer__field">
                <label htmlFor="ir-setting-auto-defer">溢出推后按钮</label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
                  <input
                    id="ir-setting-auto-defer"
                    type="checkbox"
                    checked={settings.enableAutoDefer}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      void saveSettings(
                        { enableAutoDefer: event.currentTarget.checked },
                        { notify: true }
                      )
                    }}
                  />
                  <span>在资料库诊断中显示溢出推后</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  tabIndex={0}
                  variant="outline"
                  onClick={() => void saveSettings(schemaDefaults, { notify: true })}
                >
                  恢复默认
                </Button>
                <Button tabIndex={0} variant="plain" onClick={() => void loadSettings()}>
                  重新读取
                </Button>
              </div>

              <div className="ir-drawer__section-title">漏斗诊断</div>
              <IRFunnelDiagnosticsPanel cards={cards} />

              <IRWorkspaceDangerZone isResetting={isResetting} onReset={handleReset} />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
