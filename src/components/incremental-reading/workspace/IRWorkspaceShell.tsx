import type { Block, DbId } from "../../../orca.d.ts"
import type { IRCard } from "../../../srs/incrementalReadingCollector"
import { getIRDateGroup } from "../../../srs/incrementalReadingManagerUtils"
import { attachHideableDisplayManager } from "../../../srs/hideableDisplayManager"
import {
  shouldInvokePanelWideViewToggle,
  shouldManageHostEditorChrome
} from "../../../srs/registry/panelTreeUtils"
import type { IRLibraryFilters } from "./irLibraryFilters"
import type { IRSourceNode } from "./irSourceTreeBuilder"
import type { IRWorkspaceDrawer, IRWorkspaceMode } from "./irWorkspaceTypes"
import IRDetailsDrawer from "./IRDetailsDrawer"
import IRLibraryView from "./IRLibraryView"
import IRQueueDrawer from "./IRQueueDrawer"
import IRReadingView from "./IRReadingView"
import IRWorkspaceHeader from "./IRWorkspaceHeader"
import IRWorkspaceSettings from "./IRWorkspaceSettings"
import { useIRWorkspaceLibrary } from "./useIRWorkspaceLibrary"
import { useIRWorkspaceSession } from "./useIRWorkspaceSession"
import {
  IR_WORKSPACE_MODE_EVENT,
  type IRWorkspaceLaunchRequest,
  type IRWorkspaceModeEventDetail
} from "./irWorkspaceLaunch"
import { resolveBlockDisplayTitle } from "./resolveBlockDisplayTitle"

const { useCallback, useEffect, useMemo, useRef, useState } = window.React

/** Host `.orca-block-editor` class applied only when IR is the panel main block view. */
export const IR_HOST_PANEL_CHROME_CLASS = "srs-ir-host-panel-chrome-managed"

export type IRWorkspaceShellProps = {
  panelId: string
  /** IR virtual block id (session or manager). Required for fail-closed host chrome / wide view. */
  blockId: DbId
  pluginName?: string
  initialMode?: IRWorkspaceMode
  /** 一次性启动请求（autoStart + 时长 + mixed）；mount 时消费 */
  initialLaunch?: IRWorkspaceLaunchRequest | null
  onClose?: () => void
}

export default function IRWorkspaceShell({
  panelId,
  blockId,
  pluginName: pluginNameProp,
  initialMode = "library",
  initialLaunch = null,
  onClose
}: IRWorkspaceShellProps) {
  const [pluginName, setPluginName] = useState(pluginNameProp ?? "orca-srs")
  const [mode, setMode] = useState<IRWorkspaceMode>(
    initialLaunch?.mode ?? initialMode
  )
  const [drawer, setDrawer] = useState<IRWorkspaceDrawer>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const savedScrollTopRef = useRef(0)
  const sessionCloseHandlerRef = useRef<(() => Promise<void>) | null>(null)
  /** Prevents re-toggle when effect re-runs during the same mount. */
  const wideViewAttemptedRef = useRef(false)
  /** 一次性 autoStart：仅消费 initialLaunch / 事件各一次 */
  const autoStartConsumedRef = useRef(false)
  const workspaceId = `ir-workspace-${panelId.replace(/[^a-zA-Z0-9_-]/g, "-")}`

  const loadPluginName = useCallback(async () => {
    if (pluginNameProp) {
      setPluginName(pluginNameProp)
      return pluginNameProp
    }
    try {
      const { getPluginName } = await import("../../../main")
      const name = typeof getPluginName === "function" ? getPluginName() : "orca-srs"
      setPluginName(name)
      return name
    } catch {
      setPluginName("orca-srs")
      return "orca-srs"
    }
  }, [pluginNameProp])

  const library = useIRWorkspaceLibrary(loadPluginName, pluginName)
  const reading = useIRWorkspaceSession(loadPluginName, library.libraryCards)

  /**
   * 会话启动 auto-postpone 结果（banner + 可撤销批次）。
   * 仅用户显式启动会话时更新；刷新/重试不触发（保持只读装配）。
   */
  const [autoPostponeInfo, setAutoPostponeInfo] = useState<
    { label: string | null; batchId: string | null } | null
  >(null)

  /**
   * 独立的、先于队列装配的显式步骤：当日一次自动整理积压。
   * 必须在调用 loadReadingQueue（只读装配）之前 await 完成，
   * 使被推迟的旧积压以新 due 落盘后不再进入当日队列。
   */
  const runStartAutoPostpone = useCallback(async () => {
    try {
      const name = await loadPluginName()
      const { runSessionStartAutoPostpone } = await import("./runSessionStartAutoPostpone")
      const result = await runSessionStartAutoPostpone({ pluginName: name })
      // banner/撤销仅在真正推迟的这次会话展示；无推迟或守卫跳过则清空
      setAutoPostponeInfo(
        result.batchId && result.deferredCount > 0
          ? { label: result.label, batchId: result.batchId }
          : null
      )
    } catch (error) {
      // 兜底：helper 内部已对常规失败做可见处理；此处仅防御未预期异常，且不阻断会话
      console.error("[IR Workspace] 自动整理积压异常:", error)
      orca.notify(
        "warn",
        `自动整理积压异常：${error instanceof Error ? error.message : String(error)}`,
        { title: "今日学习" }
      )
    }
  }, [loadPluginName])

  const handleAutoPostponeUndo = useCallback(async () => {
    const batchId = autoPostponeInfo?.batchId
    if (!batchId) return
    try {
      const { undoSessionStartAutoPostpone } = await import("./runSessionStartAutoPostpone")
      await undoSessionStartAutoPostpone(batchId)
      setAutoPostponeInfo(null)
      if (reading.session.ready) {
        // 撤销后重载只读队列，恢复的旧积压重新参与今日装配
        void reading.loadReadingQueue({})
      }
    } catch (error) {
      console.error("[IR Workspace] 撤销自动推迟失败:", error)
      orca.notify(
        "error",
        `撤销自动推迟失败：${error instanceof Error ? error.message : String(error)}`,
        { title: "今日学习" }
      )
    }
  }, [autoPostponeInfo, reading])

  const applyLaunchRequest = useCallback(
    (request: IRWorkspaceLaunchRequest) => {
      if (request.mode === "library") {
        if (mode === "library") {
          // stay
        } else {
          setDrawer(null)
          setMode("library")
        }
      } else {
        if (mode === "library") {
          if (listRef.current) savedScrollTopRef.current = listRef.current.scrollTop
        }
        setDrawer(null)
        setMode("reading")
      }

      if (request.autoStart === true) {
        const sessionLaunchMode = request.sessionLaunchMode ?? "mixed"
        // 真实 autoStart 时写 IR resume（失败可见，仍继续 load）
        void (async () => {
          try {
            const {
              writeIrTodayLearningResume,
              reportTodayLearningResumeWriteFailure
            } = await import(
              "../../../srs/todayLearning/todayLearningResumeStorage"
            )
            const writeResult = await writeIrTodayLearningResume({ pluginName })
            if (!writeResult.ok) {
              reportTodayLearningResumeWriteFailure(
                pluginName,
                writeResult.error
              )
            }
          } catch (resumeError) {
            console.error(
              "[IR Workspace] autoStart 写 resume 失败:",
              resumeError
            )
            orca.notify(
              "error",
              `学习可继续，但恢复点未保存：${resumeError instanceof Error ? resumeError.message : String(resumeError)}`,
              { title: "今日学习" }
            )
          }
          // 先于队列装配的显式步骤：当日一次自动整理积压（写入允许）
          await runStartAutoPostpone()
          await reading.loadReadingQueue({ sessionLaunchMode })
        })()
      }
    },
    [mode, reading, pluginName, runStartAutoPostpone]
  )

  useEffect(() => {
    if (mode !== "library") return
    const el = listRef.current
    if (!el) return
    el.scrollTop = savedScrollTopRef.current
  }, [mode])

  const persistLibraryScroll = useCallback(() => {
    if (listRef.current) savedScrollTopRef.current = listRef.current.scrollTop
  }, [])

  const handleModeChange = useCallback((next: IRWorkspaceMode) => {
    if (next === mode) return
    if (mode === "library") persistLibraryScroll()
    setDrawer(null)
    setMode(next)
  }, [mode, persistLibraryScroll])

  // mount：一次性消费 initialLaunch.autoStart
  useEffect(() => {
    if (autoStartConsumedRef.current) return
    if (!initialLaunch?.autoStart) return
    autoStartConsumedRef.current = true
    applyLaunchRequest(initialLaunch)
    // 仅 mount 时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleModeRequest = (event: Event) => {
      const detail = (event as CustomEvent<IRWorkspaceModeEventDetail>).detail
      if (detail?.panelId !== panelId) return
      const request = detail.request ?? { mode: detail.mode }
      if (request.autoStart) {
        applyLaunchRequest(request)
      } else {
        handleModeChange(request.mode)
      }
    }
    window.addEventListener(IR_WORKSPACE_MODE_EVENT, handleModeRequest)
    return () => window.removeEventListener(IR_WORKSPACE_MODE_EVENT, handleModeRequest)
  }, [applyLaunchRequest, handleModeChange, panelId])

  /**
   * Orca inactive views keep `.orca-hideable-hidden` but may leave inline `display: flex`,
   * so hidden IR subtrees still participate in layout / content-visibility paint.
   * Reuse the panel-level manager already used by Flashcard Home; cleanup on unmount.
   */
  useEffect(() => {
    const rootEl = rootRef.current
    if (!rootEl) return
    return attachHideableDisplayManager(rootEl)
  }, [])

  /**
   * When IR is the panel main block view: default Wide View + hide host editor chrome.
   * Fail-closed via shouldManageHostEditorChrome — never touch Journal embeds / query / ref previews.
   * Uses Renderer panelId (not activePanel). Wide toggle only if panel.wide is not already true,
   * and only once per mount.
   */
  useEffect(() => {
    const panel = orca.nav.findViewPanel(panelId, orca.state.panels)
    const manageHost = shouldManageHostEditorChrome(panel, panelId, blockId)
    if (!manageHost) return

    const blockEditor = rootRef.current?.closest<HTMLElement>(".orca-block-editor")
    if (blockEditor) {
      blockEditor.classList.add(IR_HOST_PANEL_CHROME_CLASS)
    }

    // Real field is ViewPanel.wide (not isWide / panels[panelId]).
    // Mark attempted even when skipped so effect re-runs never re-toggle.
    const shouldToggle = shouldInvokePanelWideViewToggle(
      manageHost,
      panel?.wide,
      wideViewAttemptedRef.current
    )
    wideViewAttemptedRef.current = true
    if (shouldToggle) {
      void (async () => {
        try {
          await orca.commands.invokeCommand("core.panel.toggleWideView", panelId)
        } catch (error) {
          console.error("[渐进阅读] 启用 Wide View 失败:", error)
          orca.notify("error", "启用宽屏视图失败", { title: "渐进阅读" })
        }
      })()
    }

    return () => {
      if (blockEditor) {
        blockEditor.classList.remove(IR_HOST_PANEL_CHROME_CLASS)
      }
    }
  }, [panelId, blockId])

  const closePanel = useCallback(() => {
    if (onClose) onClose()
    else orca.nav.close(panelId)
  }, [onClose, panelId])

  const handleClose = useCallback(() => {
    const closeSession = sessionCloseHandlerRef.current
    if (closeSession) {
      void closeSession()
      return
    }
    closePanel()
  }, [closePanel])

  const handleRefresh = useCallback(() => {
    if (mode === "library") void library.loadLibrary()
    else if (reading.session.ready) {
      // 省略 sessionLaunchMode：复用本次会话已记录的模式（或全局回退）
      void reading.loadReadingQueue({})
    } else {
      void library.loadLibrary()
    }
  }, [mode, library, reading])

  const beginReading = useCallback(async (cardId: DbId, advanceFirst: boolean) => {
    persistLibraryScroll()
    setMode("reading")
    setDrawer(null)
    // 资料库选卡也是显式启动会话：先于装配做当日一次自动整理积压
    await runStartAutoPostpone()
    await reading.startReadingWithCard(cardId, advanceFirst, () => {
      void library.loadLibrary()
    })
  }, [persistLibraryScroll, reading, library, runStartAutoPostpone])

  const statusLabel = useMemo(() => {
    if (mode === "library") {
      if (library.libraryLoading) return "加载中…"
      if (library.libraryError) return "资料库加载失败"
      const visibleCount = library.sourceTreeResult.sources.reduce(
        (sum: number, source: IRSourceNode) => sum + source.stats.matchedCardCount,
        0
      )
      return `显示 ${visibleCount}/${library.summary.total}`
    }
    if (reading.session.loading) return "队列加载中…"
    if (!reading.session.ready) return "待开始"
    if (reading.session.collectResult?.status === "error") return "队列读取失败"
    if (reading.queueSnapshot.queue.length === 0 && reading.session.ready) return "会话结束或空队列"
    return `学习中 ${reading.queueSnapshot.currentIndex + 1}/${reading.queueSnapshot.queue.length || reading.session.entries.length}`
  }, [mode, library, reading])

  const detailsTitle = library.detailsCard
    ? (library.titleMap[String(library.detailsCard.id)] ||
      resolveBlockDisplayTitle(
        orca.state.blocks?.[library.detailsCard.id] as Block | undefined,
        `#${library.detailsCard.id}`
      ))
    : ""

  return (
    <div ref={rootRef} className="ir-workspace">
      <IRWorkspaceHeader
        workspaceId={workspaceId}
        mode={mode}
        statusLabel={statusLabel}
        onModeChange={handleModeChange}
        onOpenSettings={() => setDrawer("settings")}
        onOpenQueue={() => setDrawer("queue")}
        onRefresh={handleRefresh}
        onClose={handleClose}
        showQueue={mode === "reading" && reading.session.ready}
      />

      <div className="ir-workspace__body">
        <div className={`ir-workspace__pane${mode === "library" ? "" : " ir-workspace__pane--hidden"}`}>
          <IRLibraryView
            workspaceId={workspaceId}
            loading={library.libraryLoading}
            errorMessage={library.libraryError}
            summary={library.summary}
            filters={library.filters}
            timeNavKey={library.timeNavKey}
            sourceTreeResult={library.sourceTreeResult}
            titleMap={library.titleMap}
            isSourceExpanded={library.isSourceExpanded}
            isChapterExpanded={library.isChapterExpanded}
            selectedCardIds={library.selectedCardIds}
            advancingIds={reading.advancingIds}
            sourceOptions={library.sourceOptions}
            stages={library.stages}
            candidateBatchId={library.candidateBatchId}
            isBatchRemoving={library.isBatchRemoving}
            isDeferringOverflow={library.isDeferringOverflow}
            todayQueueInfo={library.todayQueueInfo}
            listRef={listRef}
            searchInputRef={searchInputRef}
            onRetry={() => void library.loadLibrary()}
            onFiltersChange={(patch: Partial<IRLibraryFilters>) => {
              library.setFilters((prev: IRLibraryFilters) => ({ ...prev, ...patch }))
            }}
            onTimeNavChange={library.setTimeNavKey}
            onClearFilters={library.clearFilters}
            onToggleSource={library.toggleSourceExpanded}
            onToggleChapter={library.toggleChapterExpanded}
            onToggleCardSelection={(cardId: DbId) => {
              library.setSelectedCardIds((prev: Set<DbId>) => {
                const next = new Set(prev)
                if (next.has(cardId)) next.delete(cardId)
                else next.add(cardId)
                return next
              })
            }}
            onToggleGroupSelection={(cardIds: DbId[]) => {
              library.setSelectedCardIds((prev: Set<DbId>) => {
                const next = new Set(prev)
                const shouldSelectAll = cardIds.some((id: DbId) => !next.has(id))
                if (shouldSelectAll) cardIds.forEach((id: DbId) => next.add(id))
                else cardIds.forEach((id: DbId) => next.delete(id))
                return next
              })
            }}
            onOpenDetails={(cardId: DbId) => {
              library.setDetailsCardId(cardId)
              setDrawer("details")
            }}
            onStartReading={(cardId: DbId) => {
              const card = library.libraryCards.find((c: IRCard) => c.id === cardId)
              const group = card ? getIRDateGroup(card) : "今天"
              const needsAdvance =
                group === "明天" || group === "未来7天" || group === "新卡" || group === "7天后"
              void beginReading(cardId, needsAdvance)
            }}
            onAdvanceLearn={(cardId: DbId) => {
              void reading.handleAdvanceDueOnly(cardId, () => void library.loadLibrary())
            }}
            onSelectBatch={(batchId: string) => {
              const ids = library.libraryCards
                .filter((c: IRCard) => c.batchId === batchId)
                .map((c: IRCard) => c.id)
              library.setSelectedCardIds(new Set(ids))
              orca.notify("success", `已选中同批次 ${ids.length} 张`, { title: "渐进阅读" })
            }}
            onClearSelection={() => library.setSelectedCardIds(new Set())}
            onBatchRemove={library.handleBatchRemove}
            onRemoveSourceBook={library.handleRemoveSourceBook}
            onDeferOverflow={library.handleDeferOverflow}
          />
        </div>

        <div className={`ir-workspace__pane${mode === "reading" ? "" : " ir-workspace__pane--hidden"}`}>
          <IRReadingView
            workspaceId={workspaceId}
            panelId={panelId}
            pluginName={pluginName}
            sessionReady={reading.session.ready}
            sessionLoading={reading.session.loading}
            sessionEntries={reading.session.entries}
            collectResult={reading.session.collectResult}
            autoPostponeLabel={autoPostponeInfo?.label ?? null}
            onUndoAutoPostpone={
              autoPostponeInfo?.batchId ? () => void handleAutoPostponeUndo() : undefined
            }
            mixedDegradedNotice={reading.session.mixedDegradedNotice}
            sessionGeneration={reading.session.generation}
            onStartSession={(sessionLaunchMode) =>
              void (async () => {
                // 先于队列装配的显式步骤：当日一次自动整理积压
                await runStartAutoPostpone()
                await reading.loadReadingQueue({ sessionLaunchMode })
              })()
            }
            onContinueSession={() =>
              void (async () => {
                // 省略 sessionLaunchMode：沿用本次会话模式（资料库只读会话不会被改成 mixed）
                await runStartAutoPostpone()
                await reading.loadReadingQueue({})
              })()
            }
            onRetryLoad={() => void reading.loadReadingQueue({})}
            onBackToLibrary={() => handleModeChange("library")}
            onQueueSnapshot={reading.setQueueSnapshot}
            onOpenQueue={() => setDrawer("queue")}
            onClose={closePanel}
            onCloseHandlerChange={(handler) => {
              sessionCloseHandlerRef.current = handler
            }}
          />
        </div>
      </div>

      <IRDetailsDrawer
        open={drawer === "details"}
        card={library.detailsCard}
        title={detailsTitle}
        onClose={() => setDrawer(null)}
        onStartReading={(cardId: DbId) => {
          setDrawer(null)
          const card = library.libraryCards.find((c: IRCard) => c.id === cardId)
          const group = card ? getIRDateGroup(card) : "今天"
          const needsAdvance =
            group === "明天" || group === "未来7天" || group === "新卡" || group === "7天后"
          void beginReading(cardId, needsAdvance)
        }}
        onOpenInPanel={(cardId: DbId) => {
          orca.nav.openInLastPanel("block", { blockId: cardId })
        }}
      />

      <IRQueueDrawer
        open={drawer === "queue"}
        queue={reading.queueSnapshot.queue.length > 0 ? reading.queueSnapshot.queue : reading.session.entries}
        currentIndex={reading.queueSnapshot.currentIndex}
        titleMap={library.titleMap}
        onClose={() => setDrawer(null)}
      />

      <IRWorkspaceSettings
        open={drawer === "settings" || drawer === "diagnostics"}
        pluginName={pluginName}
        cards={library.libraryCards}
        showDiagnostics={drawer === "diagnostics"}
        onClose={() => setDrawer(null)}
        onSettingsChanged={() => void library.loadLibrary()}
      />
    </div>
  )
}
