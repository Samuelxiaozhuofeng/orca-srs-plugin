/**
 * Cloze 填空卡片复习渲染器
 *
 * 用于在复习界面显示填空卡：
 * - 题目状态：将 {c1:: 答案} 显示为 [...]
 * - 答案状态：显示完整内容并高亮填空部分
 */

// 从全局 window 对象获取 React 与 Valtio（Orca 插件约定）
const { useState, useMemo, useRef, useEffect } = window.React
const { useSnapshot } = window.Valtio
const { Button, ModalOverlay, BlockBreadcrumb } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { buildCardKey } from "../srs/cardIdentity"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, previewDueDates } from "../srs/algorithm"
import ClozeReviewBlockContent from "./ClozeReviewBlockContent"
import CardInfoPanel from "./review-card/CardInfoPanel"
import ReviewGradeButtons from "./review-card/ReviewGradeButtons"

type ClozeCardReviewRendererProps = {
  blockId: DbId
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void  // 跳过当前卡片（只读时为继续）
  onPrevious?: () => void  // 回到上一张
  canGoPrevious?: boolean  // 是否可以回到上一张
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  clozeNumber: number  // 当前复习的填空编号（仅隐藏该编号的填空）
  readOnly?: boolean
  readOnlyStatusText?: string
}

export default function ClozeCardReviewRenderer({
  blockId,
  onGrade,
  onPostpone,
  onSuspend,
  onClose,
  onSkip,
  onPrevious,
  canGoPrevious = false,
  srsInfo,
  isGrading = false,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName,
  clozeNumber,
  readOnly = false,
  readOnlyStatusText
}: ClozeCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(!!readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const [showBreadcrumb, setShowBreadcrumb] = useState(false)

  // 用于追踪上一个卡片的唯一标识，检测卡片切换
  const prevCardKeyRef = useRef<string>("")
  const currentCardKey = buildCardKey({
    blockId,
    cardType: "cloze",
    clozeNumber
  })

  // 当卡片变化时重置状态；只读回看默认展示答案
  useEffect(() => {
    if (prevCardKeyRef.current !== currentCardKey) {
      setShowAnswer(!!readOnly)
      setShowCardInfo(false)
      setShowBreadcrumb(false)
      prevCardKeyRef.current = currentCardKey
    } else if (readOnly) {
      setShowAnswer(true)
    }
  }, [currentCardKey, readOnly])

  // 订阅 orca.state，Valtio 会自动追踪实际访问的属性
  const snapshot = useSnapshot(orca.state)

  // 使用 useMemo 缓存派生数据，明确依赖关系
  const block = useMemo(() => {
    const blocks = snapshot?.blocks ?? {}
    return blocks[blockId]
  }, [snapshot?.blocks, blockId])

  const handleGrade = async (grade: Grade) => {
    if (isGrading || readOnly) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  // 启用复习快捷键（空格显示答案，1-4 评分，b 推迟，s 暂停）
  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    readOnly,
    pluginName,
  })

  // 预览各评分对应的间隔天数（用于按钮显示）
  const intervals = useMemo(() => {
    // 将 Partial<SrsState> 转换为完整的 SrsState 或 null
    const fullState: SrsState | null = srsInfo ? {
      stability: srsInfo.stability ?? 0,
      difficulty: srsInfo.difficulty ?? 0,
      interval: srsInfo.interval ?? 0,
      due: srsInfo.due ?? new Date(),
      lastReviewed: srsInfo.lastReviewed ?? null,
      reps: srsInfo.reps ?? 0,
      lapses: srsInfo.lapses ?? 0,
      state: srsInfo.state
    } : null
    // F2-08：与正式 nextReviewState 共用 pluginName → validated 配置
    return previewIntervals(fullState, undefined, pluginName)
  }, [srsInfo, pluginName])

  // 预览各评分对应的到期日期
  const dueDates = useMemo(() => {
    const fullState: SrsState | null = srsInfo ? {
      stability: srsInfo.stability ?? 0,
      difficulty: srsInfo.difficulty ?? 0,
      interval: srsInfo.interval ?? 0,
      due: srsInfo.due ?? new Date(),
      lastReviewed: srsInfo.lastReviewed ?? null,
      reps: srsInfo.reps ?? 0,
      lapses: srsInfo.lapses ?? 0,
      state: srsInfo.state
    } : null
    return previewDueDates(fullState, undefined, pluginName)
  }, [srsInfo, pluginName])

  // 块数据可能只是尚未加载；不要误判为“已删除”
  if (!block) {
    return (
      <div className="srs-review-card-placeholder">卡片加载中...</div>
    )
  }

  const cardContent = (
    <div
      className={`srs-cloze-card-container srs-review-card ${
        inSidePanel ? "" : "srs-review-card--modal"
      }`}
    >

      {readOnly && (
        <div contentEditable={false} className="srs-review-banner">
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      {/* 卡片类型标识 */}
      <div className="srs-review-toolbar">
        {/* 左侧：回到上一张按钮 + 卡片类型标识 */}
        <div className="srs-review-toolbar__group">
          {onPrevious && (
            <Button
              variant="plain"
              onClick={canGoPrevious ? onPrevious : undefined}
              title="回到上一张"
              className={`srs-review-icon-btn ${
                canGoPrevious ? "" : "srs-review-icon-btn--disabled"
              }`}
            >
              <i className="ti ti-arrow-left" />
            </Button>
          )}
          <div className="srs-review-type-chip srs-review-type-chip--primary">
            <i className="ti ti-braces" />
            c{clozeNumber}
          </div>
        </div>

        {/* 右侧：操作按钮（仅图标） */}
        <div className="srs-review-toolbar__group">
          {!readOnly && onPostpone && (
            <Button
              variant="plain"
              onClick={onPostpone}
              title="推迟到明天 (B)"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-calendar-pause" />
            </Button>
          )}
          {!readOnly && onSuspend && (
            <Button
              variant="plain"
              onClick={onSuspend}
              title="暂停卡片 (S)"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-player-pause" />
            </Button>
          )}
          {blockId && onJumpToCard && (
            <Button
              variant="plain"
              onClick={(e: React.MouseEvent) => onJumpToCard(blockId, e.shiftKey)}
              title="跳转到卡片 (Shift+点击在侧面板打开)"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-external-link" />
            </Button>
          )}
          {/* 显示上级路径（面包屑）开关 */}
          <Button
            variant="plain"
            onClick={() => setShowBreadcrumb((visible: boolean) => !visible)}
            title="显示上级路径"
            className={`srs-review-icon-btn ${
              showBreadcrumb ? "srs-review-icon-btn--active" : ""
            }`}
          >
            <i className="ti ti-list-tree" />
          </Button>
          {/* 卡片信息按钮 */}
          <Button
            variant="plain"
            onClick={() => setShowCardInfo(!showCardInfo)}
            title="卡片信息"
            className={`srs-review-icon-btn ${
              showCardInfo ? "srs-review-icon-btn--active" : ""
            }`}
          >
            <i className="ti ti-info-circle" />
          </Button>
        </div>
      </div>

      {/* 可折叠的卡片信息面板 */}
      {showCardInfo && <CardInfoPanel srsInfo={srsInfo} />}

      {/* 题目区域 */}
      <div className="srs-cloze-question srs-review-face srs-review-face--question">
        {blockId && showBreadcrumb && (
          <div contentEditable={false} className="srs-review-breadcrumb">
            <BlockBreadcrumb key={blockId} blockId={blockId} />
          </div>
        )}
        <ClozeReviewBlockContent
          blockId={blockId}
          panelId={panelId}
          showAnswer={showAnswer}
          clozeNumber={clozeNumber}
          fallback={block.text || "（空白内容）"}
        />
      </div>

      {/* 显示答案按钮 / 评分按钮 / 只读继续 */}
      {readOnly ? (
        <div className="srs-review-actions">
          {onSkip && (
            <Button
              variant="solid"
              onClick={onSkip}
              title="继续复习"
              className="srs-review-cta"
            >
              继续
            </Button>
          )}
        </div>
      ) : !showAnswer ? (
        <div className="srs-review-actions">
          {/* 跳过按钮 - 在答案未显示时也可用 */}
          {onSkip && (
            <Button
              variant="outline"
              onClick={onSkip}
              title="跳过当前卡片，不评分"
              className="srs-review-secondary-btn"
            >
              跳过
            </Button>
          )}
          <Button
            variant="solid"
            onClick={() => setShowAnswer(true)}
            className="srs-review-cta"
          >
            显示答案
          </Button>
        </div>
      ) : (
        <ReviewGradeButtons
          intervals={intervals}
          dueDates={dueDates}
          onGrade={handleGrade}
          onSkip={onSkip}
          readOnly={readOnly}
          pluginName={pluginName}
          isGrading={isGrading}
        />
      )}

      {/* SRS 详细信息已隐藏 */}
    </div>
  )

  if (inSidePanel) {
    return (
      <div className="srs-review-card-host">
        {cardContent}
      </div>
    )
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={onClose}
      className="srs-cloze-card-modal"
    >
      {cardContent}
    </ModalOverlay>
  )
}
