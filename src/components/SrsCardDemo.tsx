/**
 * SRS 卡片组件
 *
 * 题目与答案区域直接嵌入 Orca Block，用户可以像在正文中一样编辑，
 * 不再需要单独的 textarea 与保存逻辑。
 *
 * 支持三种卡片类型：
 * - basic 卡片（srs.card）：正面/反面模式
 * - cloze 卡片（srs.cloze-card）：填空模式
 * - direction 卡片（srs.direction-card）：方向模式
 */

// 从全局 window 对象获取 React 与 Valtio（Orca 插件约定）
const { useState, useEffect, useRef, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { Block, Button, ModalOverlay, BlockBreadcrumb } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import ClozeCardReviewRenderer from "./ClozeCardReviewRenderer"
import DirectionCardReviewRenderer from "./DirectionCardReviewRenderer"
import { extractCardType } from "../srs/deckUtils"
import SrsErrorBoundary from "./SrsErrorBoundary"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, formatInterval, formatIntervalChinese, previewDueDates, formatDueDate } from "../srs/algorithm"
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

type QuestionBlockProps = {
  blockId?: DbId
  panelId?: string
  fallback: string
}

/**
 * 题目块渲染组件
 * 渲染父块但完全移除子块 DOM，只显示题目内容
 */
function QuestionBlock({ blockId, panelId, fallback }: QuestionBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // 使用 MutationObserver 完全移除子块 DOM 元素
  useEffect(() => {
    const container = containerRef.current
    if (!container || !blockId) return

    const removeChildrenContainers = () => {
      // 完全移除子块容器（而不是隐藏），防止光标跳转
      const childrenSelector = `
        .orca-block-children,
        .orca-repr-children,
        [data-role='children'],
        [data-testid='children']
      `
      const childrenNodes = container.querySelectorAll<HTMLElement>(childrenSelector)
      childrenNodes.forEach((node: HTMLElement) => {
        node.remove()
      })
    }

    // 初始移除
    removeChildrenContainers()

    const observer = new MutationObserver((mutations) => {
      // 只在有新节点添加时检查是否需要移除子块容器
      let needsCheck = false
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              // 检查是否是子块容器或包含子块容器
              if (node.classList.contains('orca-block-children') ||
                  node.classList.contains('orca-repr-children') ||
                  node.getAttribute('data-role') === 'children' ||
                  node.querySelector('.orca-block-children, .orca-repr-children, [data-role="children"]')) {
                needsCheck = true
                break
              }
            }
          }
        }
        if (needsCheck) break
      }
      
      if (needsCheck) {
        removeChildrenContainers()
      }
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    })

    return () => {
      observer.disconnect()
    }
  }, [blockId])

  // 阻止 Tab 键缩进/减少缩进操作，防止光标偏移
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  if (!blockId || !panelId) {
    return (
      <div style={{
        padding: "12px",
        fontSize: "16px",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap",
      }}>
        {fallback}
      </div>
    )
  }

  return (
    <>
      <BlockBreadcrumb key={blockId} blockId={blockId} />
      <div
        ref={containerRef}
        className="srs-question-block"
        onKeyDown={handleKeyDown}
        data-orca-block-root="true"
      >
        <Block
          panelId={panelId}
          blockId={blockId}
          blockLevel={0}
          indentLevel={0}
        />
      </div>
    </>
  )
}

type AnswerBlockProps = {
  blockId?: DbId  // 父块（题目块）ID
  panelId?: string
  fallback: string
}

/**
 * 答案块渲染组件
 * 渲染父块但隐藏父块本身的内容，只显示子块（答案）
 * 这样可以保持正确的块层级关系，允许创建同级块
 */
function AnswerBlock({ blockId, panelId, fallback }: AnswerBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 使用 MutationObserver 隐藏父块内容，只显示子块
  useEffect(() => {
    const container = containerRef.current
    if (!container || !blockId) return

    const hideParentContent = () => {
      // 隐藏父块的主内容区域（题目），但保留子块
      const mainContent = container.querySelector<HTMLElement>(':scope > .orca-block > .orca-repr > .orca-repr-main')
      if (mainContent) {
        mainContent.style.display = "none"
      }
      
      // 隐藏父块的 handle/bullet
      const selector = `
        :scope > .orca-block > .orca-block-handle,
        :scope > .orca-block > .orca-block-bullet,
        :scope > .orca-block > .orca-repr > .orca-repr-handle,
        :scope > .orca-block > .orca-repr > .orca-repr-collapse
      `
      const elements = container.querySelectorAll<HTMLElement>(selector)
      elements.forEach((node: HTMLElement) => {
        node.style.display = "none"
        node.style.width = "0"
        node.style.height = "0"
        node.style.overflow = "hidden"
      })
    }

    const debouncedHide = (delay: number = 100) => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        hideParentContent()
        debounceTimerRef.current = null
      }, delay)
    }

    hideParentContent()

    const observer = new MutationObserver(() => {
      debouncedHide(100)
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    })

    return () => {
      observer.disconnect()
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [blockId])

  if (!blockId || !panelId) {
    return (
      <div style={{
        padding: "12px",
        fontSize: "20px",
        fontWeight: "500",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap",
      }}>
        {fallback}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="srs-answer-block"
      style={{
        // 往前缩进一个层级以对齐
        marginLeft: "-25.6px"
      }}
      data-orca-block-root="true"
    >
      <Block
        panelId={panelId}
        blockId={blockId}
        blockLevel={0}
        indentLevel={0}
      />
    </div>
  )
}

type SrsCardDemoProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void  // 跳过当前卡片
  onPrevious?: () => void  // 回到上一张
  canGoPrevious?: boolean  // 是否可以回到上一张
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  nextBlockId?: DbId  // 下一张卡片的 blockId，用于预缓存
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName?: string
  clozeNumber?: number  // 填空卡片的填空编号
  directionType?: "forward" | "backward"  // 方向卡片的复习方向
}

export default function SrsCardDemo({
  front,
  back,
  onGrade,
  onPostpone,
  onSuspend,
  onClose,
  onSkip,
  onPrevious,
  canGoPrevious = false,
  srsInfo,
  isGrading = false,
  blockId,
  nextBlockId,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName = "orca-srs",
  clozeNumber,
  directionType
}: SrsCardDemoProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [showCardInfo, setShowCardInfo] = useState(false)
  
  // 用于追踪上一个 blockId，检测卡片切换
  const prevBlockIdRef = useRef<DbId | undefined>(blockId)

  // 当 blockId 变化时重置状态，防止闪烁
  useEffect(() => {
    if (prevBlockIdRef.current !== blockId) {
      setShowAnswer(false)
      setShowCardInfo(false)
      prevBlockIdRef.current = blockId
    }
  }, [blockId])

  // 订阅 orca.state，Valtio 会自动追踪实际访问的属性
  const snapshot = useSnapshot(orca.state)

  // 使用 useMemo 缓存派生数据，明确依赖关系
  const { questionBlock, answerBlockIds, totalChildCount, inferredCardType } = useMemo(() => {
    const blocks = snapshot?.blocks ?? {}
    const qBlock = blockId ? blocks[blockId] : null
    const allChildIds = (qBlock?.children ?? []) as DbId[]
    const cardType = qBlock ? extractCardType(qBlock) : "basic"
    
    return {
      questionBlock: qBlock,
      answerBlockIds: allChildIds,  // 返回所有子块 ID
      totalChildCount: allChildIds.length,
      inferredCardType: cardType
    }
  }, [snapshot?.blocks, blockId])

  // 确定 reprType
  const reprType = inferredCardType === "cloze" 
    ? "srs.cloze-card" 
    : inferredCardType === "direction"
    ? "srs.direction-card"
    : inferredCardType === "excerpt"
    ? "srs.excerpt-card"
    : "srs.card"
  
  // 判断是否为摘录卡（显式设置为 excerpt 类型，或有 questionBlock 但无子块的 basic 卡片）
  // 注意：必须确保 questionBlock 存在，否则可能是数据还没加载
  const isExcerptCard = reprType === "srs.excerpt-card" || (reprType === "srs.card" && questionBlock && totalChildCount === 0)

  // 判断是否应该渲染 basic 卡片（用于控制快捷键）
  const shouldRenderBasicCard = reprType === "srs.card" || 
    (reprType === "srs.cloze-card" && !blockId) ||
    (reprType === "srs.direction-card" && (!blockId || !directionType))

  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
    console.log(`[SRS Card Demo] 用户选择评分: ${grade}`)
    await onGrade(grade)
    setShowAnswer(false)
  }

  // 【修复 React Hooks 规则】将 useReviewShortcuts 移到条件返回之前
  // 只有渲染 basic 卡片时才启用快捷键（cloze/direction 组件有自己的快捷键处理）
  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    enabled: shouldRenderBasicCard,  // 仅在渲染 basic 卡片时启用
  })
  // 【修复 React Hooks 规则】将 intervals 计算移到条件返回之前
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

  // 如果是 cloze 卡片，使用专门的 Cloze 渲染器
  if (reprType === "srs.cloze-card" && blockId) {
    return (
      <SrsErrorBoundary componentName="填空卡片" errorTitle="填空卡片加载出错">
        <ClozeCardReviewRenderer
          blockId={blockId}
          onGrade={onGrade}
          onPostpone={onPostpone}
          onSuspend={onSuspend}
          onClose={onClose}
          onSkip={onSkip}
          onPrevious={onPrevious}
          canGoPrevious={canGoPrevious}
          srsInfo={srsInfo}
          isGrading={isGrading}
          onJumpToCard={onJumpToCard}
          inSidePanel={inSidePanel}
          panelId={panelId}
          pluginName={pluginName}
          clozeNumber={clozeNumber}  // 传递填空编号
        />
      </SrsErrorBoundary>
    )
  }

  // 如果是 direction 卡片，使用专门的 Direction 渲染器
  if (reprType === "srs.direction-card" && blockId && directionType) {
    return (
      <SrsErrorBoundary componentName="方向卡片" errorTitle="方向卡片加载出错">
        <DirectionCardReviewRenderer
          blockId={blockId}
          onGrade={onGrade}
          onPostpone={onPostpone}
          onSuspend={onSuspend}
          onClose={onClose}
          onSkip={onSkip}
          onPrevious={onPrevious}
          canGoPrevious={canGoPrevious}
          srsInfo={srsInfo}
          isGrading={isGrading}
          onJumpToCard={onJumpToCard}
          inSidePanel={inSidePanel}
          panelId={panelId}
          pluginName={pluginName}
          reviewDirection={directionType}  // 传递复习方向
        />
      </SrsErrorBoundary>
    )
  }

  const cardContent = (
    <div className="srs-card-container" style={{
      borderRadius: "12px",
      padding: "16px",
      width: inSidePanel ? "100%" : "90%",
      minWidth: inSidePanel ? "0" : "600px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>

      {/* 顶部工具栏：简化为图标按钮，降低视觉干扰 */}
      {blockId && (
        <div contentEditable={false} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          opacity: 0.6,
          transition: "opacity 0.2s"
        }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}>
          {/* 左侧：回到上一张按钮 */}
          <div style={{ display: "flex", gap: "4px" }}>
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
            {onJumpToCard && (
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
      )}

      {/* 可折叠的卡片信息面板 */}
      {blockId && showCardInfo && (
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

      {/* 摘录卡：只显示内容区域，不显示题目 */}
      {!isExcerptCard && (
        <div 
          className="srs-card-front" 
          style={{
            marginBottom: "16px",
            padding: "20px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            minHeight: "80px"
          }}
        >
          <QuestionBlock
            key={blockId}
            blockId={blockId}
            panelId={panelId}
            fallback={front}
          />
        </div>
      )}

      {/* 摘录卡：直接显示内容和评分按钮 */}
      {isExcerptCard ? (
        <>
          <div 
            className="srs-card-back" 
            style={{
              marginBottom: "16px",
              padding: "20px",
              borderRadius: "8px",
              minHeight: "80px"
            }}
          >
            <div contentEditable={false} style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "var(--orca-color-text-2)",
              marginBottom: "16px",
              textAlign: "center",
            }}>
              摘录
            </div>

            {/* 显示主块（不隐藏子块） */}
            {blockId && panelId && (
              <Block
                panelId={panelId}
                blockId={blockId}
                blockLevel={0}
                indentLevel={0}
              />
            )}
            {!blockId && (
              <div style={{
                padding: "12px",
                fontSize: "20px",
                fontWeight: "500",
                color: "var(--orca-color-text-1)",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                userSelect: "text",
                WebkitUserSelect: "text",
              }}>
                {front}
              </div>
            )}
          </div>

          {/* 评分按钮（含跳过） */}
          <div contentEditable={false} className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: onSkip ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
            gap: "8px"
          }}>
            {/* 跳过按钮 */}
            {onSkip && (
              <button
                onClick={onSkip}
                style={{
                  padding: "16px 8px",
                  fontSize: "14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "rgba(156, 163, 175, 0.12)",
                  border: "1px solid rgba(156, 163, 175, 0.2)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)"
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>不评分</div>
                <span style={{ fontSize: "32px", lineHeight: "1" }}>⏭️</span>
                <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>跳过</span>
              </button>
            )}

            <button
              onClick={() => handleGrade("again")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.again).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.again) : `${formatDueDate(dueDates.again)} ${formatIntervalChinese(intervals.again)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😞</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>忘记</span>
            </button>

            <button
              onClick={() => handleGrade("hard")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.hard).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.hard) : `${formatDueDate(dueDates.hard)} ${formatIntervalChinese(intervals.hard)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😐</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>困难</span>
            </button>

            <button
              onClick={() => handleGrade("good")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.good).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.good) : `${formatDueDate(dueDates.good)} ${formatIntervalChinese(intervals.good)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😊</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>良好</span>
            </button>

            <button
              onClick={() => handleGrade("easy")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.easy).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.easy) : `${formatDueDate(dueDates.easy)} ${formatIntervalChinese(intervals.easy)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😄</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>简单</span>
            </button>
          </div>
        </>
      ) : (
        /* 普通卡片：如果没有子块（摘录卡），直接显示评分按钮；否则显示答案按钮 */
        totalChildCount === 0 || showAnswer ? (
        // 摘录卡或已显示答案：显示答案区域（如果有）和评分按钮
        <>
          {/* 答案区域 - 只在有子块且已显示答案时显示 */}
          {totalChildCount > 0 && showAnswer && (
            <div 
              className="srs-card-back" 
              style={{
                marginBottom: "16px",
                padding: "20px",
                borderRadius: "8px",
                minHeight: "80px"
              }}
            >
              <div contentEditable={false} style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "var(--orca-color-text-2)",
                marginBottom: "16px",
                textAlign: "center",
              }}>
                答案
              </div>

              {/* 渲染父块但隐藏父块内容，只显示子块，保持正确的层级关系 */}
              <AnswerBlock
                key={blockId}
                blockId={blockId}
                panelId={panelId}
                fallback={back}
              />
            </div>
          )}

          {/* 评分按钮（含跳过） */}
          <div contentEditable={false} className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: onSkip ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
            gap: "8px"
          }}>
            {/* 跳过按钮 */}
            {onSkip && (
              <button
                onClick={onSkip}
                style={{
                  padding: "16px 8px",
                  fontSize: "14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "rgba(156, 163, 175, 0.12)",
                  border: "1px solid rgba(156, 163, 175, 0.2)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)"
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>不评分</div>
                <span style={{ fontSize: "32px", lineHeight: "1" }}>⏭️</span>
                <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>跳过</span>
              </button>
            )}

            <button
              onClick={() => handleGrade("again")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.again).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.again) : `${formatDueDate(dueDates.again)} ${formatIntervalChinese(intervals.again)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😞</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>忘记</span>
            </button>

            <button
              onClick={() => handleGrade("hard")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.hard).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.hard) : `${formatDueDate(dueDates.hard)} ${formatIntervalChinese(intervals.hard)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😐</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>困难</span>
            </button>

            <button
              onClick={() => handleGrade("good")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.good).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.good) : `${formatDueDate(dueDates.good)} ${formatIntervalChinese(intervals.good)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😊</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>良好</span>
            </button>

            <button
              onClick={() => handleGrade("easy")}
              style={{
                padding: "16px 8px",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)"
                e.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>
                {(() => {
                  const isToday = new Date(dueDates.easy).toDateString() === new Date().toDateString()
                  return isToday ? formatIntervalChinese(intervals.easy) : `${formatDueDate(dueDates.easy)} ${formatIntervalChinese(intervals.easy)}`
                })()}
              </div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😄</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>简单</span>
            </button>
          </div>
        </>
      ) : (
        // 有子块但未显示答案：显示"显示答案"按钮
        <div contentEditable={false} style={{ textAlign: "center", marginBottom: "12px" }}>
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
      )
      )}

      {/* SRS 详细信息已隐藏 */}
    </div>
  )

  // 预缓存下一张卡片的块数据（隐藏渲染）
  const prefetchBlock = nextBlockId && panelId ? (
    <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden', pointerEvents: 'none' }}>
      <Block
        panelId={panelId}
        blockId={nextBlockId}
        blockLevel={0}
        indentLevel={0}
      />
    </div>
  ) : null

  if (inSidePanel) {
    return (
      <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {cardContent}
          {prefetchBlock}
        </div>
      </SrsErrorBoundary>
    )
  }

  return (
    <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
      <ModalOverlay
        visible={true}
        canClose={true}
        onClose={onClose}
        className="srs-card-modal"
      >
        {cardContent}
        {prefetchBlock}
      </ModalOverlay>
    </SrsErrorBoundary>
  )
}
