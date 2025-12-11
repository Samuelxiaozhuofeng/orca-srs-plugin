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
const { Block, Button, ModalOverlay } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import ClozeCardReviewRenderer from "./ClozeCardReviewRenderer"
import DirectionCardReviewRenderer from "./DirectionCardReviewRenderer"
import { extractCardType } from "../srs/deckUtils"
import SrsErrorBoundary from "./SrsErrorBoundary"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, formatInterval } from "../srs/algorithm"
import { getReviewSettings } from "../srs/settings/reviewSettingsSchema"

type ReviewBlockProps = {
  blockId?: DbId
  panelId?: string
  fallback: string
  hideChildren?: boolean
}

function ReviewBlock({ blockId, panelId, fallback, hideChildren = false }: ReviewBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 使用 ref 存储防抖定时器 ID，避免闭包问题
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 修改 2：注入全局 CSS 样式隐藏 Block 组件的编辑器 UI 元素
  useEffect(() => {
    const styleId = 'srs-review-block-styles'
    
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        /* 隐藏 bullet point、块手柄、拖拽手柄等 */
        .srs-block-container .orca-block-handle,
        .srs-block-container .orca-block-bullet,
        .srs-block-container .orca-block-drag-handle,
        .srs-block-container .orca-repr-handle,
        .srs-block-container .orca-repr-collapse,
        .srs-block-container [class*="handle"],
        .srs-block-container [class*="bullet"],
        .srs-block-container [data-role="handle"],
        .srs-block-container [data-role="bullet"] {
          display: none !important;
          visibility: hidden !important;
          width: 0 !important;
          height: 0 !important;
        }
        
        /* 移除缩进和间距 */
        .srs-block-container .orca-block,
        .srs-block-container .orca-repr-main {
          padding-left: 0 !important;
          margin-left: 0 !important;
        }
        
        /* 隐藏子块（仅在题目区域） */
        .srs-block-hide-children [class*="children"],
        .srs-block-hide-children [data-role*="children"],
        .srs-block-hide-children [data-testid*="children"] {
          display: none !important;
          visibility: hidden !important;
        }
      `
      document.head.appendChild(style)
    }
    
    return () => {
      const style = document.getElementById(styleId)
      if (style && !document.querySelector('.srs-card-container')) {
        style.remove()
      }
    }
  }, [])

  // 修改 3：增强 MutationObserver 的隐藏范围
  useEffect(() => {
    if (!hideChildren) return
    const container = containerRef.current
    if (!container) return

    /**
     * 隐藏子块元素和编辑器 UI 元素
     * 扩展选择器范围，隐藏 handle、bullet、collapse 等元素
     */
    const hideDescendants = () => {
      // 扩展选择器：包含 children、handle、bullet、collapse 等
      const selector = `
        [class*='children'],
        [data-role*='children'],
        [data-testid*='children'],
        [class*='handle'],
        [class*='bullet'],
        [class*='collapse'],
        [data-role='handle'],
        [data-role='bullet'],
        .orca-block-handle,
        .orca-block-bullet,
        .orca-repr-handle,
        .orca-block-drag-handle,
        .orca-repr-collapse
      `
      const childNodes = container.querySelectorAll<HTMLElement>(selector)
      childNodes.forEach((node: HTMLElement) => {
        node.style.display = "none"
        // 为 handle/bullet 元素强制设置尺寸为 0
        if (node.classList.contains('orca-block-handle') ||
            node.classList.contains('orca-block-bullet') ||
            node.classList.contains('orca-repr-handle')) {
          node.style.width = "0"
          node.style.height = "0"
          node.style.overflow = "hidden"
        }
      })
    }

    /**
     * 带防抖的隐藏子块函数
     * 防止 MutationObserver 频繁触发导致性能问题
     * @param delay 防抖延迟时间（毫秒）
     */
    const debouncedHideDescendants = (delay: number = 100) => {
      // 清除之前的定时器
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
      // 设置新的定时器
      debounceTimerRef.current = setTimeout(() => {
        hideDescendants()
        debounceTimerRef.current = null
      }, delay)
    }

    // 初始执行一次（无延迟）
    hideDescendants()

    // 创建 MutationObserver，使用防抖回调
    const observer = new MutationObserver(() => {
      debouncedHideDescendants(100)
    })

    // 只监听直接子节点变化，减少不必要的触发
    // subtree: true 仍然需要，因为 Block 组件可能在深层嵌套中渲染 children
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false,      // 不监听属性变化
      characterData: false    // 不监听文本变化
    })

    // 清理函数：断开 observer 并取消待执行的防抖调用
    return () => {
      observer.disconnect()
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [hideChildren, blockId])

  const containerClassName = `srs-block-container${hideChildren ? " srs-block-hide-children" : ""}`

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{
        padding: "8px",
        backgroundColor: "var(--orca-color-bg-0)",
        borderRadius: "6px",
        border: "1px solid var(--orca-color-border-1)"
      }}
    >
      {blockId && panelId ? (
        <Block
          panelId={panelId}
          blockId={blockId}
          blockLevel={0}
          indentLevel={0}
          renderingMode={hideChildren ? "simple" : undefined}
        />
      ) : (
        <div style={{
          fontSize: "16px",
          color: "var(--orca-color-text-1)",
          lineHeight: "1.6",
          whiteSpace: "pre-wrap"
        }}>
          {fallback}
        </div>
      )}
    </div>
  )
}

type SrsCardDemoProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onBury?: () => void
  onSuspend?: () => void
  onClose?: () => void
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  onJumpToCard?: (blockId: DbId) => void
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
  onBury,
  onSuspend,
  onClose,
  srsInfo,
  isGrading = false,
  blockId,
  onJumpToCard,
  inSidePanel = false,
  panelId,
  pluginName = "orca-srs",
  clozeNumber,
  directionType
}: SrsCardDemoProps) {
  const [showAnswer, setShowAnswer] = useState(false)

  // 订阅 orca.state，Valtio 会自动追踪实际访问的属性
  const snapshot = useSnapshot(orca.state)

  // 获取复习设置
  const reviewSettings = useMemo(() => {
    return getReviewSettings(pluginName)
  }, [pluginName])

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
    : "srs.card"

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
    onBury,
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

  // 如果是 cloze 卡片，使用专门的 Cloze 渲染器
  if (reprType === "srs.cloze-card" && blockId) {
    return (
      <SrsErrorBoundary componentName="填空卡片" errorTitle="填空卡片加载出错">
        <ClozeCardReviewRenderer
          blockId={blockId}
          onGrade={onGrade}
          onBury={onBury}
          onSuspend={onSuspend}
          onClose={onClose}
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
          onBury={onBury}
          onSuspend={onSuspend}
          onClose={onClose}
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

  const renderBlock = (renderBlockId: DbId | undefined, fallback: string, options?: { hideChildren?: boolean }) => (
    <ReviewBlock
      blockId={renderBlockId}
      panelId={panelId}
      fallback={fallback}
      hideChildren={options?.hideChildren}
    />
  )

  const cardContent = (
    <div className="srs-card-container" style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "16px",
      width: inSidePanel ? "100%" : "90%",
      minWidth: inSidePanel ? "0" : "600px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }}>

      {/* 顶部工具栏：埋藏、暂停、跳转按钮 */}
      {blockId && (
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          marginBottom: "12px"
        }}>
          {onBury && (
            <Button
              variant="soft"
              onClick={onBury}
              title="埋藏到明天 (B)"
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <i className="ti ti-calendar-pause" />
              埋藏
            </Button>
          )}
          {onSuspend && (
            <Button
              variant="soft"
              onClick={onSuspend}
              title="暂停卡片 (S)"
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <i className="ti ti-player-pause" />
              暂停
            </Button>
          )}
          {onJumpToCard && (
            <Button
              variant="soft"
              onClick={() => onJumpToCard(blockId)}
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <i className="ti ti-arrow-right" />
              跳转到卡片
            </Button>
          )}
        </div>
      )}

      <div className="srs-card-front" style={{
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        minHeight: "80px"
      }}>
        <div style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "var(--orca-color-text-2)",
          marginBottom: "12px"
        }}>
          题目
        </div>

        {renderBlock(blockId, front, { hideChildren: true })}
      </div>

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
          <div className="srs-card-back" style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            minHeight: "80px",
            borderLeft: "4px solid var(--orca-color-primary-5)"
          }}>
            <div style={{
              fontSize: "14px",
              color: "var(--orca-color-text-2)",
              fontWeight: "500",
              marginBottom: "12px"
            }}>
              答案：
            </div>

            {/* 根据设置显示子块 */}
            {reviewSettings.showSiblingBlocks ? (
              // 显示所有同级子块（限制最大数量）
              <>
                {answerBlockIds.slice(0, reviewSettings.maxSiblingBlocks).map((aBlockId: DbId, index: number) => (
                  <div 
                    key={aBlockId} 
                    style={{ 
                      marginBottom: index < Math.min(answerBlockIds.length, reviewSettings.maxSiblingBlocks) - 1 ? "12px" : 0 
                    }}
                  >
                    {renderBlock(aBlockId, back)}
                  </div>
                ))}
                {/* 如果子块数量超过限制，显示提示 */}
                {totalChildCount > reviewSettings.maxSiblingBlocks && (
                  <div style={{
                    marginTop: "12px",
                    fontSize: "13px",
                    color: "var(--orca-color-text-3)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "8px",
                    backgroundColor: "var(--orca-color-bg-3)",
                    borderRadius: "6px"
                  }}>
                    还有 {totalChildCount - reviewSettings.maxSiblingBlocks} 个子块未显示
                  </div>
                )}
              </>
            ) : (
              // 默认：只显示第一个子块
              renderBlock(answerBlockIds[0], back)
            )}
          </div>

          <div className="srs-card-grade-buttons" style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px"
          }}>
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
              <span style={{ fontWeight: 600 }}>{formatInterval(intervals.easy)}</span>
              <span style={{ fontSize: "12px", opacity: 0.8 }}>简单</span>
            </Button>
          </div>
        </>
      )}

      <div style={{
        marginTop: "16px",
        textAlign: "center",
        fontSize: "12px",
        color: "var(--orca-color-text-2)",
        opacity: 0.7
      }}>
        {!showAnswer ? "点击\"显示答案\"查看答案内容" : "根据记忆程度选择评分"}
      </div>

      {/* SRS 详细信息已隐藏 */}
    </div>
  )

  if (inSidePanel) {
    return (
      <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {cardContent}
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
      </ModalOverlay>
    </SrsErrorBoundary>
  )
}
