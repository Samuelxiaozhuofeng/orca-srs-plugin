/**
 * Cloze 填空卡片复习渲染器
 *
 * 用于在复习界面显示填空卡：
 * - 题目状态：将 {c1:: 答案} 显示为 [...]
 * - 答案状态：显示完整内容并高亮填空部分
 */

// 从全局 window 对象获取 React 与 Valtio（Orca 插件约定）
const { useState, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { Button, ModalOverlay } = orca.components

import type { DbId, ContentFragment } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, formatInterval, previewDueDates, formatDueDate } from "../srs/algorithm"
import { State } from "ts-fsrs"

/**
 * 格式化卡片状态为中文
 */
function formatCardState(state?: State): string {
  if (state === undefined || state === null) return "新卡"
  switch (state) {
    case State.New: return "新卡"
    case State.Learning: return "学习中"
    case State.Review: return "复习中"
    case State.Relearning: return "重学中"
    default: return "未知"
  }
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "从未"
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

type ClozeCardReviewRendererProps = {
  blockId: DbId
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void  // 跳过当前卡片
  onPrevious?: () => void  // 回到上一张
  canGoPrevious?: boolean  // 是否可以回到上一张
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  clozeNumber?: number  // 当前复习的填空编号（仅隐藏该编号的填空）
}

/**
 * 渲染 ContentFragment 数组为可视化内容
 *
 * @param fragments - 内容片段数组
 * @param showAnswers - 是否显示答案（true = 显示答案，false = 显示 [...]）
 * @param pluginName - 插件名称（用于识别 cloze fragment）
 * @param currentClozeNumber - 当前复习的填空编号（仅隐藏该编号的填空，其他填空显示答案）
 */
function renderFragments(
  fragments: ContentFragment[] | undefined,
  showAnswers: boolean,
  pluginName: string,
  currentClozeNumber?: number
): React.ReactNode[] {
  if (!fragments || fragments.length === 0) {
    return [<span key="empty">（空白内容）</span>]
  }

  return fragments.map((fragment, index) => {
    // 普通文本片段
    if (fragment.t === "t") {
      return <span key={index}>{fragment.v}</span>
    }

    // Cloze 片段
    if (fragment.t === `${pluginName}.cloze`) {
      const fragmentClozeNumber = (fragment as any).clozeNumber

      // 判断是否应该隐藏此填空
      // 如果 currentClozeNumber 存在，只隐藏该编号的填空；否则隐藏所有填空
      const shouldHide = currentClozeNumber
        ? fragmentClozeNumber === currentClozeNumber
        : true

      if (showAnswers || !shouldHide) {
        // 显示答案：高亮显示填空内容
        return (
          <span
            key={index}
            style={{
              backgroundColor: "var(--orca-color-primary-1)",
              color: "var(--orca-color-primary-5)",
              fontWeight: "600",
              padding: "2px 6px",
              borderRadius: "4px",
              borderBottom: "2px solid var(--orca-color-primary-5)"
            }}
          >
            {fragment.v}
          </span>
        )
      } else {
        // 隐藏答案：显示 [...]
        return (
          <span
            key={index}
            style={{
              color: "var(--orca-color-text-2)",
              fontWeight: "500",
              padding: "2px 6px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "4px",
              border: "1px dashed var(--orca-color-border-1)"
            }}
          >
            [...]
          </span>
        )
      }
    }

    // 其他类型的 fragment（暂时显示原始内容）
    return (
      <span key={index} style={{ color: "var(--orca-color-text-2)" }}>
        {fragment.v}
      </span>
    )
  })
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
  clozeNumber
}: ClozeCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [showCardInfo, setShowCardInfo] = useState(false)

  // 订阅 orca.state，Valtio 会自动追踪实际访问的属性
  const snapshot = useSnapshot(orca.state)

  // 使用 useMemo 缓存派生数据，明确依赖关系
  const block = useMemo(() => {
    const blocks = snapshot?.blocks ?? {}
    return blocks[blockId]
  }, [snapshot?.blocks, blockId])

  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
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
    return previewIntervals(fullState)
  }, [srsInfo])

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
    return previewDueDates(fullState)
  }, [srsInfo])

  // 从 block.content 中提取内容片段
  const contentFragments = useMemo(() => {
    return block?.content ?? []
  }, [block?.content])

  // 渲染题目（隐藏当前填空编号的答案）
  const questionContent = useMemo(() => {
    return renderFragments(contentFragments, false, pluginName, clozeNumber)
  }, [contentFragments, pluginName, clozeNumber])

  // 渲染答案（显示所有填空）
  const answerContent = useMemo(() => {
    return renderFragments(contentFragments, true, pluginName, clozeNumber)
  }, [contentFragments, pluginName, clozeNumber])

  const cardContent = (
    <div className="srs-cloze-card-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "16px",
      width: inSidePanel ? "100%" : "90%",
      minWidth: inSidePanel ? "0" : "600px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>

      {/* 卡片类型标识 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
        opacity: 0.6,
        transition: "opacity 0.2s"
      }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}>
        {/* 左侧：回到上一张按钮 + 卡片类型标识 */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {onPrevious && (
            <Button
              variant="plain"
              onClick={canGoPrevious ? onPrevious : undefined}
              title="回到上一张"
              style={{
                padding: "4px 6px",
                fontSize: "14px",
                opacity: canGoPrevious ? 1 : 0.3,
                cursor: canGoPrevious ? "pointer" : "not-allowed"
              }}
            >
              <i className="ti ti-arrow-left" />
            </Button>
          )}
          <div style={{
            fontSize: "12px",
            fontWeight: "500",
            color: "var(--orca-color-primary-5)",
            backgroundColor: "var(--orca-color-primary-1)",
            padding: "2px 8px",
            borderRadius: "4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px"
          }}>
            <i className="ti ti-braces" style={{ fontSize: "11px" }} />
            c{clozeNumber || "?"}
          </div>
        </div>

        {/* 右侧：操作按钮（仅图标） */}
        <div style={{ display: "flex", gap: "2px" }}>
          {onPostpone && (
            <Button
              variant="plain"
              onClick={onPostpone}
              title="推迟到明天 (B)"
              style={{ padding: "4px 6px", fontSize: "14px" }}
            >
              <i className="ti ti-calendar-pause" />
            </Button>
          )}
          {onSuspend && (
            <Button
              variant="plain"
              onClick={onSuspend}
              title="暂停卡片 (S)"
              style={{ padding: "4px 6px", fontSize: "14px" }}
            >
              <i className="ti ti-player-pause" />
            </Button>
          )}
          {blockId && onJumpToCard && (
            <Button
              variant="plain"
              onClick={(e: React.MouseEvent) => onJumpToCard(blockId, e.shiftKey)}
              title="跳转到卡片 (Shift+点击在侧面板打开)"
              style={{ padding: "4px 6px", fontSize: "14px" }}
            >
              <i className="ti ti-external-link" />
            </Button>
          )}
          {/* 卡片信息按钮 */}
          <Button
            variant="plain"
            onClick={() => setShowCardInfo(!showCardInfo)}
            title="卡片信息"
            style={{
              padding: "4px 6px",
              fontSize: "14px",
              color: showCardInfo ? "var(--orca-color-primary-5)" : undefined
            }}
          >
            <i className="ti ti-info-circle" />
          </Button>
        </div>
      </div>

      {/* 可折叠的卡片信息面板 */}
      {showCardInfo && (
        <div 
          contentEditable={false}
          style={{
            marginBottom: "12px",
            padding: "12px 16px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            fontSize: "13px",
            color: "var(--orca-color-text-2)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>遗忘次数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.lapses ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>复习次数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.reps ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>卡片状态</span>
              <span style={{ 
                color: srsInfo?.state === State.Review ? "var(--orca-color-success)" : 
                       srsInfo?.state === State.Learning || srsInfo?.state === State.Relearning ? "var(--orca-color-warning)" :
                       "var(--orca-color-primary)"
              }}>
                {formatCardState(srsInfo?.state)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>最后复习</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{formatDateTime(srsInfo?.lastReviewed)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>下次到期</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{formatDateTime(srsInfo?.due)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>间隔天数</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{srsInfo?.interval ?? 0} 天</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>稳定性</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{(srsInfo?.stability ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>难度</span>
              <span style={{ color: "var(--orca-color-text-1)" }}>{(srsInfo?.difficulty ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 题目区域 */}
      <div className="srs-cloze-question" style={{
        marginBottom: "16px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        minHeight: "100px",
        fontSize: "16px",
        lineHeight: "1.8",
        color: "var(--orca-color-text-1)"
      }}>
        {showAnswer ? answerContent : questionContent}
      </div>

      {/* 显示答案按钮 / 评分按钮 */}
      {!showAnswer ? (
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <Button
            variant="solid"
            onClick={() => setShowAnswer(true)}
            style={{
              padding: "12px 32px",
              fontSize: "16px"
            }}
          >
            显示答案
          </Button>
        </div>
      ) : (
        <>
          <div className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: onSkip ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
            gap: "8px",
            marginTop: "16px"
          }}>
            {/* 跳过按钮 */}
            {onSkip && (
              <Button
                variant="soft"
                onClick={onSkip}
                style={{
                  padding: "12px 8px",
                  fontSize: "14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span style={{ fontSize: "11px", opacity: 0.7 }}>不评分</span>
                <span style={{ fontWeight: 600 }}>⏭️</span>
                <span style={{ fontSize: "12px", opacity: 0.8 }}>跳过</span>
              </Button>
            )}

            <Button
              variant="dangerous"
              onClick={() => handleGrade("again")}
              style={{
                padding: "12px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span style={{ fontSize: "11px", opacity: 0.7 }}>{formatDueDate(dueDates.again)}</span>
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.again)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>忘记</span>
            </Button>

            <Button
              variant="soft"
              onClick={() => handleGrade("hard")}
              style={{
                padding: "12px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span style={{ fontSize: "11px", opacity: 0.7 }}>{formatDueDate(dueDates.hard)}</span>
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.hard)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>困难</span>
            </Button>

            <Button
              variant="solid"
              onClick={() => handleGrade("good")}
              style={{
                padding: "12px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span style={{ fontSize: "11px", opacity: 0.7 }}>{formatDueDate(dueDates.good)}</span>
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.good)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>良好</span>
            </Button>

            <Button
              variant="solid"
              onClick={() => handleGrade("easy")}
              style={{
                padding: "12px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                backgroundColor: "var(--orca-color-primary-5)",
                opacity: 0.9
              }}
            >
              <span style={{ fontSize: "11px", opacity: 0.7 }}>{formatDueDate(dueDates.easy)}</span>
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
            </Button>
          </div>
        </>
      )}

      {/* SRS 详细信息已隐藏 */}
    </div>
  )

  if (inSidePanel) {
    return (
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
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
