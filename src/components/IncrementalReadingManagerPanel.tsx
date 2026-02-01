import type { DbId } from "../orca.d.ts"
import type { IRCard } from "../srs/incrementalReadingCollector"
import { buildIRQueue, collectAllIRCards, deferIROverflow } from "../srs/incrementalReadingCollector"
import { startAutoMarkExtract, stopAutoMarkExtract } from "../srs/incrementalReadingAutoMark"
import { setNextIRSessionFocusCardId } from "../srs/incrementalReadingSessionManager"
import { advanceDueToToday } from "../srs/incrementalReadingStorage"
import {
  DEFAULT_IR_DAILY_LIMIT,
  DEFAULT_IR_TOPIC_QUOTA_PERCENT,
  getIncrementalReadingSettings,
  INCREMENTAL_READING_SETTINGS_KEYS,
  incrementalReadingSettingsSchema,
  type IncrementalReadingSettings
} from "../srs/settings/incrementalReadingSettingsSchema"

import {
  IRDateGroupKey,
  IR_GROUP_DEFAULT_EXPANDED
} from "../srs/incrementalReadingManagerUtils"
import IRStatistics from "./IRStatistics"
import IRCardList from "./IRCardList"

import SrsErrorBoundary from "./SrsErrorBoundary"

const { useCallback, useEffect, useMemo, useRef, useState } = window.React
const { BlockShell, Button, ConfirmBox } = orca.components

type RendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
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

function getDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

type IRSettingsCardProps = {
  pluginName: string
}

function IRSettingsCard({ pluginName }: IRSettingsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [settings, setSettings] = useState<IncrementalReadingSettings | null>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [topicQuotaPercentInput, setTopicQuotaPercentInput] = useState<string>("")
  const [dailyLimitInput, setDailyLimitInput] = useState<string>("")
  const lastSavedRef = useRef<IncrementalReadingSettings | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true)
    try {
      const nextSettings = getIncrementalReadingSettings(pluginName)
      setSettings(nextSettings)
      setTopicQuotaPercentInput(String(nextSettings.topicQuotaPercent))
      setDailyLimitInput(String(nextSettings.dailyLimit))
      lastSavedRef.current = nextSettings
    } catch (error) {
      console.error("[IR Manager] 加载渐进阅读设置失败:", error)
      orca.notify("error", "加载渐进阅读设置失败", { title: "渐进阅读" })
    } finally {
      setIsLoadingSettings(false)
    }
  }, [pluginName])

  useEffect(() => {
    if (!isExpanded) return
    void loadSettings()
  }, [isExpanded, loadSettings])

  const saveSettings = useCallback(async (
    patch: Partial<IncrementalReadingSettings>,
    options: { notify?: boolean } = {}
  ) => {
    if (!pluginName) return
    if (Object.keys(patch).length === 0) return

    setIsSaving(true)
    try {
      const toSave: Record<string, any> = {}
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

      const merged: IncrementalReadingSettings = {
        ...(settings ?? getIncrementalReadingSettings(pluginName)),
        ...patch
      }
      setSettings(merged)
      lastSavedRef.current = merged

      if (patch.enableAutoExtractMark !== undefined) {
        if (patch.enableAutoExtractMark) {
          startAutoMarkExtract(pluginName)
        } else {
          stopAutoMarkExtract(pluginName)
        }
      }

      if (options.notify) {
        orca.notify("success", "渐进阅读设置已保存", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Manager] 保存渐进阅读设置失败:", error)
      orca.notify("error", `保存渐进阅读设置失败: ${error}`, { title: "渐进阅读" })

      const fallback = lastSavedRef.current
      if (fallback) {
        setSettings(fallback)
        setTopicQuotaPercentInput(String(fallback.topicQuotaPercent))
        setDailyLimitInput(String(fallback.dailyLimit))
      }
    } finally {
      setIsSaving(false)
    }
  }, [pluginName, settings])

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--orca-color-border-1)",
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  }

  const titleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px"
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    fontWeight: 600,
    letterSpacing: "0.02em"
  }

  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--orca-color-border-1)",
    backgroundColor: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "14px",
    outline: "none"
  }

  const disabledStyle = isSaving
    ? { opacity: 0.6, pointerEvents: "none" as const }
    : undefined

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

  return (
    <div style={cardStyle}>
      <div
        style={{
          ...titleStyle,
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={() => setIsExpanded((prev: boolean) => !prev)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <i
            className={isExpanded ? "ti ti-chevron-down" : "ti ti-chevron-right"}
            style={{ fontSize: "16px", color: "var(--orca-color-text-3)" }}
          />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>队列设置</div>
            <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
              {isExpanded ? "这里修改的是插件设置（与插件 Settings 面板同步）" : "点击展开配置"}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <div
            style={{ display: "flex", gap: "8px", alignItems: "center" }}
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              onClick={() => saveSettings(schemaDefaults, { notify: true })}
              style={disabledStyle}
            >
              恢复默认
            </Button>
            <Button
              variant="plain"
              onClick={loadSettings}
              style={disabledStyle}
              title="重新读取当前设置"
            >
              <i className="ti ti-refresh" />
            </Button>
          </div>
        ) : null}
      </div>

      {isExpanded ? (
        isLoadingSettings || !settings ? (
          <div style={{ fontSize: "13px", color: "var(--orca-color-text-2)" }}>
            加载设置中...
          </div>
        ) : (
          <div style={disabledStyle}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "12px"
            }}>
              <div style={{
                border: "1px solid var(--orca-color-border-1)",
                backgroundColor: "var(--orca-color-bg-2)",
                borderRadius: "12px",
                padding: "12px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={labelStyle}>启用渐进阅读自动标签</div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={settings.enableAutoExtractMark}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      void saveSettings({ enableAutoExtractMark: event.currentTarget.checked }, { notify: true })
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--orca-color-text-1)" }}>
                    自动为 Topic 的子块标记为 Extract
                  </span>
                </label>
                <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
                  启用后会监听块变化：Topic 的直接子块会自动补齐 <code>#card</code> 并设置 <code>type=extracts</code>。
                </div>
              </div>

              <div style={{
                border: "1px solid var(--orca-color-border-1)",
                backgroundColor: "var(--orca-color-bg-2)",
                borderRadius: "12px",
                padding: "12px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={labelStyle}>Topic 配额比例（%）</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={topicQuotaPercentInput}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setTopicQuotaPercentInput(event.currentTarget.value)
                  }}
                  onBlur={() => {
                    const next = normalizePercent(Number(topicQuotaPercentInput))
                    setTopicQuotaPercentInput(String(next))
                    if (next !== settings.topicQuotaPercent) {
                      void saveSettings({ topicQuotaPercent: next })
                    }
                  }}
                  style={inputBaseStyle}
                />
                <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
                  渐进阅读队列中 Topic 的目标占比（默认 {DEFAULT_IR_TOPIC_QUOTA_PERCENT}%）。
                </div>
              </div>

              <div style={{
                border: "1px solid var(--orca-color-border-1)",
                backgroundColor: "var(--orca-color-bg-2)",
                borderRadius: "12px",
                padding: "12px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={labelStyle}>每日渐进阅读上限</div>
                <input
                  type="number"
                  min={0}
                  step={1}
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
                  style={inputBaseStyle}
                />
                <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
                  每天最多推送的渐进阅读卡片数量，设为 0 表示不限制（默认 {DEFAULT_IR_DAILY_LIMIT}）。
                </div>
              </div>

              <div style={{
                border: "1px solid var(--orca-color-border-1)",
                backgroundColor: "var(--orca-color-bg-2)",
                borderRadius: "12px",
                padding: "12px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={labelStyle}>溢出推后按钮</div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={settings.enableAutoDefer}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      void saveSettings({ enableAutoDefer: event.currentTarget.checked }, { notify: true })
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "var(--orca-color-text-1)" }}>
                    显示“一键把溢出推后”
                  </span>
                </label>
                <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }}>
                  当到期卡超过每日上限时，提供手动按钮；打开面板只展示，不会自动改排期。
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  )
}

export default function IncrementalReadingManagerPanel(props: RendererProps) {
  const {
    panelId,
    blockId,
    rndId,
    blockLevel,
    indentLevel,
    mirrorId,
    initiallyCollapsed,
    renderingMode
  } = props

  const [pluginName, setPluginName] = useState("orca-srs")
  const [cards, setCards] = useState<IRCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [todayQueueInfo, setTodayQueueInfo] = useState<{
    dailyLimit: number
    totalDueCount: number
    overflowCount: number
    enableOverflowDefer: boolean
  }>({
    dailyLimit: 0,
    totalDueCount: 0,
    overflowCount: 0,
    enableOverflowDefer: true
  })
  const [isDeferringOverflow, setIsDeferringOverflow] = useState(false)
  const advancingRef = useRef<Set<DbId>>(new Set())
  const [advancingIds, setAdvancingIds] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<IRDateGroupKey, boolean>>(() => ({
    ...IR_GROUP_DEFAULT_EXPANDED
  }))

  const loadPluginName = useCallback(async () => {
    const { getPluginName } = await import("../main")
    const currentPluginName = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
    setPluginName(currentPluginName)
    return currentPluginName
  }, [])

  const loadCards = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const currentPluginName = await loadPluginName()
      const allCards = await collectAllIRCards(currentPluginName)
      setCards(allCards)

      const settings = getIncrementalReadingSettings(currentPluginName)
      const now = new Date()
      const todayStartTime = getDayStart(now).getTime()
      const dueCards = allCards.filter((card: IRCard) => {
        if (!(card.due instanceof Date)) return false
        return getDayStart(card.due).getTime() <= todayStartTime
      })
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit,
        now
      })
      setTodayQueueInfo({
        dailyLimit: settings.dailyLimit,
        totalDueCount: dueCards.length,
        overflowCount: settings.dailyLimit > 0 ? Math.max(0, dueCards.length - queue.length) : 0,
        enableOverflowDefer: settings.enableAutoDefer
      })
    } catch (error) {
      console.error("[IR Manager] 加载卡片失败:", error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
      orca.notify("error", "加载渐进阅读管理面板失败", { title: "渐进阅读" })
    } finally {
      setIsLoading(false)
    }
  }, [loadPluginName])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  const handleCardClick = (cardId: DbId) => {
    orca.nav.openInLastPanel("block", { blockId: cardId })
  }

  const handleToggleGroup = (groupKey: IRDateGroupKey) => {
    setExpandedGroups((prev: Record<IRDateGroupKey, boolean>) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
  }

  const handleAdvanceLearn = useCallback(async (cardId: DbId) => {
    if (advancingRef.current.has(cardId)) return
    advancingRef.current.add(cardId)
    setAdvancingIds((prev: Record<string, boolean>) => ({
      ...prev,
      [String(cardId)]: true
    }))

    try {
      await advanceDueToToday(cardId, { now: new Date() })
      await setNextIRSessionFocusCardId(pluginName, cardId)

      // 若会话面板已打开，触发其刷新并优先展示 focusCard
      window.dispatchEvent(new CustomEvent("orca-srs:ir-session-focus", { detail: { pluginName } }))

      await orca.commands.invokeCommand(`${pluginName}.startIncrementalReadingSession`)
      await loadCards()
      orca.notify("success", "已提前到今天，并在渐进阅读会话中打开", { title: "渐进阅读" })
    } catch (error) {
      console.error("[IR Manager] 提前学失败:", error)
      orca.notify("error", "提前学失败", { title: "渐进阅读" })
    } finally {
      advancingRef.current.delete(cardId)
      setAdvancingIds((prev: Record<string, boolean>) => {
        const next = { ...prev }
        delete next[String(cardId)]
        return next
      })
    }
  }, [pluginName, loadCards])

  const handleDeferOverflow = async () => {
    if (isDeferringOverflow) return
    setIsDeferringOverflow(true)
    try {
      const settings = getIncrementalReadingSettings(pluginName)
      const now = new Date()
      const todayStartTime = getDayStart(now).getTime()
      const dueCards = cards.filter((card: IRCard) => {
        if (!(card.due instanceof Date)) return false
        return getDayStart(card.due).getTime() <= todayStartTime
      })
      const queue = await buildIRQueue(dueCards, {
        topicQuotaPercent: settings.topicQuotaPercent,
        dailyLimit: settings.dailyLimit,
        now
      })

      const { deferredCount } = await deferIROverflow(dueCards, queue, { now })
      await loadCards()
      if (deferredCount > 0) {
        orca.notify("success", `已推后溢出 ${deferredCount} 张`, { title: "渐进阅读" })
      } else {
        orca.notify("info", "当前没有需要推后的溢出卡片", { title: "渐进阅读" })
      }
    } catch (error) {
      console.error("[IR Manager] 溢出推后失败:", error)
      orca.notify("error", "溢出推后失败", { title: "渐进阅读" })
    } finally {
      setIsDeferringOverflow(false)
    }
  }

  const header = useMemo(() => (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px"
    }}>
      <div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>渐进阅读管理面板</div>
        <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
          聚焦到期与排期，浏览渐进阅读卡片
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="plain" onClick={loadCards}>
          <i className="ti ti-refresh" />
        </Button>
        <Button variant="plain" onClick={() => orca.nav.close(panelId)}>
          关闭
        </Button>
      </div>
    </div>
  ), [loadCards, panelId])

  const renderContent = () => {
    const showOverflowAction = Boolean(
      todayQueueInfo.enableOverflowDefer &&
      todayQueueInfo.dailyLimit > 0 &&
      todayQueueInfo.overflowCount > 0 &&
      !isLoading &&
      !errorMessage
    )

    const overflowActionCard = todayQueueInfo.dailyLimit > 0 ? (
      <div style={{
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>今日队列（只展示，不自动改排期）</div>
            <div style={{ fontSize: "12px", color: "var(--orca-color-text-3)" }}>
              今日候选 {todayQueueInfo.totalDueCount} · 上限 {todayQueueInfo.dailyLimit} · 溢出 {todayQueueInfo.overflowCount}
            </div>
          </div>
          {showOverflowAction ? (
            <ConfirmBox
              text={`确认把溢出（未入选今天队列）的 ${todayQueueInfo.overflowCount} 张卡片推后吗？该操作会修改它们的排期。`}
              onConfirm={async (_e, close) => {
                await handleDeferOverflow()
                close()
              }}
            >
              {(open) => (
                <Button
                  variant="outline"
                  onClick={open}
                  style={isDeferringOverflow ? { opacity: 0.6, pointerEvents: "none" as const } : undefined}
                >
                  一键把溢出推后
                </Button>
              )}
            </ConfirmBox>
          ) : null}
        </div>
      </div>
    ) : null

    const cardsSection = isLoading ? (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "220px",
        fontSize: "14px",
        color: "var(--orca-color-text-2)"
      }}>
        加载渐进阅读卡片中...
      </div>
    ) : errorMessage ? (
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "24px",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        minHeight: "220px"
      }}>
        <div style={{ color: "var(--orca-color-danger-5)" }}>加载失败：{errorMessage}</div>
        <Button variant="solid" onClick={loadCards}>
          重试
        </Button>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {overflowActionCard}
        <IRStatistics cards={cards} />
        <IRCardList
          cards={cards}
          expandedGroups={expandedGroups}
          onCardClick={handleCardClick}
          onToggleGroup={handleToggleGroup}
          onAdvanceLearn={handleAdvanceLearn}
          advancingIds={advancingIds}
        />
      </div>
    )

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <IRSettingsCard pluginName={pluginName} />
        {cardsSection}
      </div>
    )
  }

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="srs-ir-manager"
      contentClassName="srs-ir-manager-content"
      contentJsx={(
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "16px",
          height: "100%",
          overflow: "auto"
        }}>
          {header}
          <SrsErrorBoundary componentName="渐进阅读管理面板" errorTitle="渐进阅读管理面板加载出错">
            {renderContent()}
          </SrsErrorBoundary>
        </div>
      )}
      childrenJsx={null}
    />
  )
}
