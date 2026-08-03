import type { DbId } from "../../orca.d.ts"
import type { ReviewCard } from "../../srs/types"
import type { FilterType } from "../../srs/cardFilterUtils"
import {
  cardKeyFromReviewCard,
  inferCardType
} from "../../srs/cardIdentity"
import {
  invalidateFlashHomeDataCache
} from "../../srs/flashHomeDataLoader"
import { invalidateTodayLearningSummaryCache } from "../../srs/todayLearning/todayLearningSummary"
import type { TtsBatchItem } from "../../srs/tts/ttsBatch"
import CardListItem from "./CardListItem"
import TtsBatchBar from "./TtsBatchBar"
import { useTtsBatchMode } from "./useTtsBatchMode"
import { isGlobalDeckScope, resolveCardListTitle } from "./homeStatNav"
import {
  CardBrowserToolbar,
  CardListChrome
} from "./CardBrowserControls"
import {
  buildManageConfirmTexts,
  CardBatchAlert,
  CardManageBatchBar,
  CardSelectHint
} from "./CardBrowserBatchControls"
import {
  BROWSER_STATUS_LABELS,
  browserCardKeySet,
  collectBrowserCardTypeOptions,
  collectBrowserDeckOptions,
  collectBrowserTagOptions,
  countDueFilterTabs,
  countReviewableDueCards,
  dedupeCardsByBlockId,
  mergeBrowserSourceCards,
  nextSelectionAfterBatch,
  pickCardsByKeys,
  pruneBrowserSelection,
  queryBrowserCards,
  type BrowserQuery,
  type BrowserSortKey,
  type BrowserStatusFilter
} from "./cardBrowserQuery"
import {
  batchActivateCards,
  batchChangeDeck,
  batchResetCards,
  batchSuspendCards,
  formatBatchFailureLines,
  formatBatchResultSummary,
  type BatchActionResult
} from "./cardBrowserBatchActions"

const { useCallback, useEffect, useMemo, useRef, useState } = window.React

type CardListViewProps = {
  deckName: string
  /** 同 scope active（未做到期筛选） */
  activeCards: ReviewCard[]
  /** 同 scope suspended；默认 status=active 不展示 */
  suspendedCards: ReviewCard[]
  /** 全库 active+suspended：仅改牌组目标；父级已加载，不新扫库 */
  deckResolutionCards: ReviewCard[]
  currentFilter: FilterType
  panelId: string
  pluginName: string
  onFilterChange: (filter: FilterType) => void
  onCardClick: (cardId: DbId) => void
  onCardReset: (card: ReviewCard) => void
  onCardDelete: (card: ReviewCard) => void
  onBack: () => void
  onReviewDeck: (deckName: string) => void
  /** 批量写成功后 force reload；失败须 reject */
  onAfterBatchMutation?: () => Promise<void>
}

const PAGE_SIZE = 20

export default function CardListView({
  deckName,
  activeCards,
  suspendedCards,
  deckResolutionCards,
  currentFilter,
  panelId,
  pluginName,
  onFilterChange,
  onCardClick,
  onCardReset,
  onCardDelete,
  onBack,
  onReviewDeck,
  onAfterBatchMutation
}: CardListViewProps) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const loaderRef = useRef<HTMLDivElement>(null)
  const globalScope = isGlobalDeckScope(deckName)
  const title = resolveCardListTitle(deckName, currentFilter)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] =
    useState<BrowserStatusFilter>("active")
  const [tagFilter, setTagFilter] = useState("")
  const [cardTypeFilter, setCardTypeFilter] = useState("")
  const [deckFilter, setDeckFilter] = useState("")
  const [sortKey, setSortKey] = useState<BrowserSortKey>("default")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchAlert, setBatchAlert] = useState<string | null>(null)
  const [deckTargetDraft, setDeckTargetDraft] = useState("")

  const sourceCards = useMemo(
    () => mergeBrowserSourceCards(activeCards, suspendedCards),
    [activeCards, suspendedCards]
  )

  const browserQuery: BrowserQuery = useMemo(
    () => ({
      dueFilter: currentFilter,
      status: statusFilter,
      search,
      tag: tagFilter,
      cardType: cardTypeFilter,
      deck: deckFilter,
      sort: sortKey
    }),
    [currentFilter, statusFilter, search, tagFilter, cardTypeFilter, deckFilter, sortKey]
  )
  const filteredCards = useMemo(
    () => queryBrowserCards(sourceCards, browserQuery),
    [sourceCards, browserQuery]
  )
  const visibleKeys = useMemo(() => browserCardKeySet(filteredCards), [filteredCards])

  useEffect(() => {
    setSelectedKeys((prev: Set<string>) => {
      const next = pruneBrowserSelection(prev, visibleKeys)
      return next === prev ? prev : next
    })
  }, [visibleKeys])

  const tagOptions = useMemo(() => collectBrowserTagOptions(sourceCards), [sourceCards])
  const typeOptions = useMemo(() => collectBrowserCardTypeOptions(sourceCards), [sourceCards])
  const deckFilterOptions = useMemo(() => collectBrowserDeckOptions(sourceCards), [sourceCards])
  const changeDeckOptions = useMemo(
    () => collectBrowserDeckOptions(deckResolutionCards),
    [deckResolutionCards]
  )
  const filterCounts = useMemo(
    () => countDueFilterTabs(sourceCards, statusFilter),
    [sourceCards, statusFilter]
  )
  const hasDueCards = useMemo(() => countReviewableDueCards(activeCards).hasDue, [activeCards])

  const tts = useTtsBatchMode({
    cards: filteredCards,
    pluginName,
    selectionResetKey: `${currentFilter}:${deckName}:${statusFilter}:${search}:${tagFilter}:${cardTypeFilter}:${deckFilter}`
  })

  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
  }, [currentFilter, filteredCards.length, deckName, statusFilter, search, tagFilter, cardTypeFilter, deckFilter, sortKey])

  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < filteredCards.length) {
          setDisplayCount((prev: number) => Math.min(prev + PAGE_SIZE, filteredCards.length))
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(loader)
    return () => observer.disconnect()
  }, [displayCount, filteredCards.length])

  useEffect(() => {
    if (tts.batchMode) {
      setSelectedKeys(new Set())
      setBatchAlert(null)
    }
  }, [tts.batchMode])

  const displayedCards = filteredCards.slice(0, displayCount)
  const hasMore = displayCount < filteredCards.length
  const selectedCount = selectedKeys.size
  const manageMode = !tts.batchMode
  const controlsDisabled = tts.batchRunning || batchBusy

  const toggleManageSelect = useCallback((key: string) => {
    setSelectedKeys((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const selectAllFiltered = useCallback(() => {
    setSelectedKeys(new Set(visibleKeys))
  }, [visibleKeys])
  const clearSelection = useCallback(() => setSelectedKeys(new Set()), [])
  const selectedCards = useMemo(
    () => pickCardsByKeys(filteredCards, selectedKeys),
    [filteredCards, selectedKeys]
  )

  const refreshAfterMutation = useCallback(async () => {
    invalidateFlashHomeDataCache()
    invalidateTodayLearningSummaryCache()
    if (!onAfterBatchMutation) return
    try {
      await onAfterBatchMutation()
    } catch (error) {
      console.error(`[${pluginName}] 批量动作后刷新失败:`, error)
      orca.notify("warn", "动作已写入但刷新失败，请手动刷新页面", {
        title: "SRS"
      })
    }
  }, [onAfterBatchMutation, pluginName])

  const applyBatchResult = useCallback(
    async (actionLabel: string, result: BatchActionResult) => {
      const summary = formatBatchResultSummary(actionLabel, result)
      const failLines = formatBatchFailureLines(result, 8)
      if (result.failed.length > 0) {
        setBatchAlert([summary, ...failLines].join("\n"))
        orca.notify(
          result.success.length > 0 ? "warn" : "error",
          summary,
          { title: "SRS" }
        )
      } else {
        setBatchAlert(null)
        orca.notify("success", summary, { title: "SRS" })
      }
      setSelectedKeys((prev: Set<string>) =>
        nextSelectionAfterBatch(prev, result)
      )
      if (result.success.length > 0) await refreshAfterMutation()
    },
    [refreshAfterMutation]
  )

  const runBatch = useCallback(
    async (
      actionLabel: string,
      runner: () => Promise<BatchActionResult>
    ) => {
      if (selectedCards.length === 0 || batchBusy) return
      setBatchBusy(true)
      setBatchAlert(null)
      try {
        await applyBatchResult(actionLabel, await runner())
      } catch (error) {
        console.error(`[${pluginName}] ${actionLabel}异常:`, error)
        const msg = error instanceof Error ? error.message : String(error)
        setBatchAlert(`${actionLabel}异常：${msg}`)
        orca.notify("error", `${actionLabel}异常：${msg}`, { title: "SRS" })
      } finally {
        setBatchBusy(false)
      }
    },
    [selectedCards.length, batchBusy, applyBatchResult, pluginName]
  )

  const uniqueBlockCount = useMemo(
    () => dedupeCardsByBlockId(selectedCards).length,
    [selectedCards]
  )
  const confirmTexts = buildManageConfirmTexts({
    selectedCount,
    uniqueBlockCount,
    deckTarget: deckTargetDraft
  })

  const guardCardAction = useCallback(
    (fn: (card: ReviewCard) => void) => (card: ReviewCard) => {
      if (batchBusy) return
      fn(card)
    },
    [batchBusy]
  )

  return (
    <div className="srs-card-list-view">
      <CardListChrome
        title={title}
        batchBusy={batchBusy}
        ttsBatchMode={tts.batchMode}
        ttsBatchRunning={tts.batchRunning}
        showReviewCta={!globalScope && hasDueCards}
        onBack={onBack}
        onEnterTts={() => tts.setBatchMode(true)}
        onExitTts={tts.exitBatchMode}
        onReviewDeck={() => onReviewDeck(deckName)}
        currentFilter={currentFilter}
        onFilterChange={onFilterChange}
        filterCounts={filterCounts}
        controlsDisabled={controlsDisabled}
      />

      <CardBrowserToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        cardTypeFilter={cardTypeFilter}
        onCardTypeChange={setCardTypeFilter}
        tagFilter={tagFilter}
        onTagChange={setTagFilter}
        deckFilter={deckFilter}
        onDeckFilterChange={setDeckFilter}
        sortKey={sortKey}
        onSortChange={setSortKey}
        tagOptions={tagOptions}
        typeOptions={typeOptions}
        deckFilterOptions={deckFilterOptions}
        controlsDisabled={controlsDisabled}
      />

      {tts.batchMode && (
        <TtsBatchBar
          cardsTotal={filteredCards.length}
          basicFilter={tts.basicFilter}
          selectedCount={tts.selectedKeys.size}
          batchRunning={tts.batchRunning}
          skipExisting={tts.skipExisting}
          onSkipExistingChange={tts.setSkipExisting}
          liveProgress={tts.liveProgress}
          onSelectAll={tts.selectAllEligible}
          onClearSelection={tts.clearSelection}
          onStart={() => {
            void tts.startBatch()
          }}
          onCancel={tts.cancelBatch}
          onRetryFailed={() => {
            void tts.retryFailed()
          }}
        />
      )}

      {manageMode && (
        <CardManageBatchBar
          selectedCount={selectedCount}
          uniqueBlockCount={uniqueBlockCount}
          filteredCount={filteredCards.length}
          batchBusy={batchBusy}
          deckTargetDraft={deckTargetDraft}
          onDeckTargetChange={setDeckTargetDraft}
          changeDeckOptions={changeDeckOptions}
          suspendConfirmText={confirmTexts.suspendConfirmText}
          resetConfirmText={confirmTexts.resetConfirmText}
          changeDeckConfirmText={confirmTexts.changeDeckConfirmText}
          onSelectAll={selectAllFiltered}
          onClearSelection={clearSelection}
          onSuspend={() => {
            void runBatch("批量暂停", () => batchSuspendCards(selectedCards))
          }}
          onActivate={() => {
            void runBatch("批量激活", () =>
              batchActivateCards(selectedCards, { pluginName })
            )
          }}
          onReset={() => {
            void runBatch("批量重置", () => batchResetCards(selectedCards))
          }}
          onChangeDeck={() => {
            void runBatch(`批量改牌组 → ${deckTargetDraft}`, async () => {
              const result = await batchChangeDeck(
                selectedCards,
                deckTargetDraft,
                deckResolutionCards
              )
              if (result.failed.length === 0) setDeckTargetDraft("")
              return result
            })
          }}
        />
      )}

      <CardBatchAlert
        message={manageMode ? batchAlert : null}
        onDismiss={() => setBatchAlert(null)}
      />

      {manageMode && selectedCount === 0 && (
        <CardSelectHint
          filteredCount={filteredCards.length}
          batchBusy={batchBusy}
          onSelectAll={selectAllFiltered}
        />
      )}

      {filteredCards.length > 0 && (
        <div className="srs-card-list-frame__count">
          共 {filteredCards.length} 张
          {statusFilter !== "active"
            ? ` · ${BROWSER_STATUS_LABELS[statusFilter as BrowserStatusFilter]}`
            : ""}
        </div>
      )}

      <div className="srs-card-list-frame">
        {filteredCards.length === 0 ? (
          <div className="srs-card-list-frame--empty">没有符合条件的卡片</div>
        ) : (
          <>
            {displayedCards.map((card: ReviewCard) => {
              const key = cardKeyFromReviewCard(card)
              const type = inferCardType(card)
              const isBasic = type === "basic"
              const frontOk = (card.front ?? "").trim().length > 0
              const selectable = tts.batchMode && isBasic && frontOk
              const selected = tts.selectedKeys.has(key)
              const batchItem = tts.batchItems?.find(
                (i: TtsBatchItem) => i.cardKey === key
              )
              return (
                <CardListItem
                  key={key}
                  card={card}
                  panelId={panelId}
                  onCardClick={onCardClick}
                  onCardReset={guardCardAction(onCardReset)}
                  onCardDelete={guardCardAction(onCardDelete)}
                  batchMode={tts.batchMode}
                  selectable={selectable}
                  selected={selected}
                  batchStatus={batchItem?.status}
                  batchError={batchItem?.error}
                  skipReason={
                    tts.batchMode && !selectable
                      ? !isBasic
                        ? `非 Basic（${type}）`
                        : "正面为空"
                      : undefined
                  }
                  onToggleSelect={
                    selectable ? () => tts.toggleSelect(key) : undefined
                  }
                  manageSelect={manageMode}
                  manageSelected={selectedKeys.has(key)}
                  manageSelectDisabled={batchBusy}
                  actionsDisabled={batchBusy}
                  onToggleManageSelect={
                    batchBusy ? undefined : () => toggleManageSelect(key)
                  }
                />
              )
            })}
            <div ref={loaderRef} className="srs-card-list-loader">
              {hasMore ? (
                <span>
                  加载更多... ({displayCount}/{filteredCards.length})
                </span>
              ) : filteredCards.length > PAGE_SIZE ? (
                <span>已加载全部 {filteredCards.length} 张卡片</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
