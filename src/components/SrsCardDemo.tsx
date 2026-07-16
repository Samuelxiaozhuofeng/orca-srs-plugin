/** 卡片类型路由器：负责块可用性与选择对应的复习 renderer。 */

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { extractCardType } from "../srs/deckUtils"
import {
  detectChoiceMode,
  extractChoiceOptions,
  shuffleOptions
} from "../srs/choiceUtils"
import { createChoiceAnswerHandler } from "../srs/choiceAnswerStatistics"
import { isOrderedTag } from "../srs/tagUtils"
import BasicCardReviewRenderer from "./review-card/BasicCardReviewRenderer"
import ChoiceCardReviewRenderer from "./ChoiceCardReviewRenderer"
import ClozeCardReviewRenderer from "./ClozeCardReviewRenderer"
import DirectionCardReviewRenderer from "./DirectionCardReviewRenderer"
import ListCardReviewRenderer from "./ListCardReviewRenderer"
import SrsErrorBoundary from "./SrsErrorBoundary"

const { useEffect, useMemo, useState } = window.React
const { useSnapshot } = window.Valtio

export type SrsCardDemoProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  canGoPrevious?: boolean
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  nextBlockId?: DbId
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName?: string
  clozeNumber?: number
  directionType?: "forward" | "backward"
  listItemId?: DbId
  listItemIndex?: number
  listItemIds?: DbId[]
  isAuxiliaryPreview?: boolean
  readOnly?: boolean
  readOnlyStatusText?: string
}

export default function SrsCardDemo(props: SrsCardDemoProps) {
  const {
    blockId,
    clozeNumber,
    directionType,
    listItemId,
    listItemIndex,
    listItemIds,
    pluginName = "orca-srs",
    onSkip,
    readOnly = false
  } = props
  const snapshot = useSnapshot(orca.state)
  const [isBlockLoading, setIsBlockLoading] = useState(false)
  const [blockLoadAttempted, setBlockLoadAttempted] = useState(false)
  const cardKey = `${blockId}-${clozeNumber ?? 0}-${directionType ?? "basic"}-${listItemId ?? 0}`

  const { questionBlock, totalChildCount, inferredCardType } = useMemo(() => {
    const block = blockId ? snapshot?.blocks?.[blockId] : null
    const childIds = (block?.children ?? []) as DbId[]
    return {
      questionBlock: block,
      totalChildCount: childIds.length,
      inferredCardType: block ? extractCardType(block) : "basic"
    }
  }, [snapshot?.blocks, blockId])

  useEffect(() => {
    if (!blockId || questionBlock || isBlockLoading || blockLoadAttempted) return
    setIsBlockLoading(true)
    void orca.invokeBackend("get-block", blockId)
      .then((block: unknown) => {
        if (!block) console.log(`[SRS Card Demo] 卡片 #${blockId} 确实已被删除`)
        setBlockLoadAttempted(true)
        setIsBlockLoading(false)
      })
      .catch((error: unknown) => {
        console.warn(`[SRS Card Demo] 加载卡片 #${blockId} 失败:`, error)
        setBlockLoadAttempted(true)
        setIsBlockLoading(false)
      })
  }, [blockId, questionBlock, isBlockLoading, blockLoadAttempted])

  useEffect(() => {
    setBlockLoadAttempted(false)
  }, [cardKey])

  useEffect(() => {
    if (blockId && !questionBlock && blockLoadAttempted && !isBlockLoading && onSkip) {
      console.log(`[SRS Card Demo] 卡片 #${blockId} 已被删除，自动跳过`)
      onSkip()
    }
  }, [blockId, questionBlock, blockLoadAttempted, isBlockLoading, onSkip])

  if (blockId && !questionBlock) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "200px",
        color: "var(--orca-color-text-2)"
      }}>
        加载中...
      </div>
    )
  }

  const sharedRendererProps = {
    onGrade: props.onGrade,
    onPostpone: props.onPostpone,
    onSuspend: props.onSuspend,
    onClose: props.onClose,
    onSkip: props.onSkip,
    onPrevious: props.onPrevious,
    canGoPrevious: props.canGoPrevious,
    srsInfo: props.srsInfo,
    isGrading: props.isGrading,
    onJumpToCard: props.onJumpToCard,
    inSidePanel: props.inSidePanel,
    panelId: props.panelId,
    pluginName,
    readOnly,
    readOnlyStatusText: props.readOnlyStatusText
  }

  if (inferredCardType === "cloze" && blockId) {
    return (
      <SrsErrorBoundary componentName="填空卡片" errorTitle="填空卡片加载出错">
        <ClozeCardReviewRenderer {...sharedRendererProps} blockId={blockId} clozeNumber={clozeNumber} />
      </SrsErrorBoundary>
    )
  }

  if (inferredCardType === "direction" && blockId && directionType) {
    return (
      <SrsErrorBoundary componentName="方向卡片" errorTitle="方向卡片加载出错">
        <DirectionCardReviewRenderer {...sharedRendererProps} blockId={blockId} reviewDirection={directionType} />
      </SrsErrorBoundary>
    )
  }

  if (inferredCardType === "list" && blockId && listItemId && listItemIndex && listItemIds) {
    return (
      <SrsErrorBoundary componentName="列表卡片" errorTitle="列表卡片加载出错">
        <ListCardReviewRenderer
          {...sharedRendererProps}
          blockId={blockId}
          listItemId={listItemId}
          listItemIndex={listItemIndex}
          listItemIds={listItemIds}
          isAuxiliaryPreview={props.isAuxiliaryPreview}
        />
      </SrsErrorBoundary>
    )
  }

  if (inferredCardType === "choice" && blockId && questionBlock) {
    const rawOptions = extractChoiceOptions(questionBlock)
    const ordered = questionBlock.refs?.some(
      (reference: any) => reference.type === 2 && isOrderedTag(reference.alias)
    ) ?? false
    const { options } = shuffleOptions(rawOptions, ordered)
    const onAnswer = readOnly
      ? undefined
      : createChoiceAnswerHandler({ blockId, options: rawOptions })

    return (
      <SrsErrorBoundary componentName="选择题卡片" errorTitle="选择题卡片加载出错">
        <ChoiceCardReviewRenderer
          {...sharedRendererProps}
          blockId={blockId}
          options={options}
          mode={detectChoiceMode(rawOptions)}
          onAnswer={onAnswer}
        />
      </SrsErrorBoundary>
    )
  }

  const isExcerptCard =
    inferredCardType === "excerpt" ||
    (inferredCardType === "basic" && questionBlock != null && totalChildCount === 0)

  return (
    <BasicCardReviewRenderer
      {...sharedRendererProps}
      front={props.front}
      back={props.back}
      blockId={blockId}
      nextBlockId={props.nextBlockId}
      cardKey={cardKey}
      totalChildCount={totalChildCount}
      isExcerptCard={isExcerptCard}
    />
  )
}
