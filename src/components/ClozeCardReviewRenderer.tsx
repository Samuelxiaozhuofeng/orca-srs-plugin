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
const { Button, ModalOverlay, BlockBreadcrumb, Block, BlockChildren, BlockShell } = orca.components
import type { DbId, ContentFragment, Block } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"
import { useReviewShortcuts } from "../hooks/useReviewShortcuts"
import { previewIntervals, previewDueDates, formatDueDate } from "../srs/algorithm"
import { State } from "ts-fsrs"
import { extractClozeContentFromBlockTree } from "../srs/clozeUtils"

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
  allClozeContent?: Array<{ number: number; content: string }>  // 从块树中提取的 cloze 内容，用于表格 cloze 卡片或 BG 卡片
  cardType?: string  // 卡片类型，用于区分 cloze 和 bg 卡片
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
  currentClozeNumber?: number,
  allClozeContent?: Array<{ number: number; content: string }>,
  cardType?: string
): React.ReactNode[] {
  // 检查 fragments 中是否包含 Cloze 片段
  const hasClozeFragments = fragments?.some((fragment: ContentFragment) => 
    fragment.t === `${pluginName}.cloze` || 
    (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
  )

  // 如果是 BG 卡片，或者没有 Cloze 片段但有从块树中提取的 Cloze 内容，显示 Cloze 内容
  // BG 卡片或表格 cloze 卡片时，遍历表格内块对象
  // 复习时，序号对应挖空文本，按序号隐藏挖空文本
  if (cardType === "bg" || (!hasClozeFragments && allClozeContent && allClozeContent.length > 0)) {
    return allClozeContent?.map((item, index) => {
      const shouldHide = currentClozeNumber
        ? item.number === currentClozeNumber
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
              borderBottom: "2px solid var(--orca-color-primary-5)",
              margin: "0 2px"
            }}
          >
            {item.content}
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
              border: "1px dashed var(--orca-color-border-1)",
              margin: "0 2px"
            }}
          >
            [...]
          </span>
        )
      }
    }) || [<span key="empty">（空白内容）</span>]
  }

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
  clozeNumber,
  allClozeContent: propsAllClozeContent,
  cardType
}: ClozeCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const [allClozeContent, setAllClozeContent] = useState<{ number: number; content: string }[]>(propsAllClozeContent || [])

  // 用于追踪上一个卡片的唯一标识，检测卡片切换
  const prevCardKeyRef = useRef<string>("")
  const currentCardKey = `${blockId}-${clozeNumber ?? 0}`
  const blockContainerRef = useRef<HTMLDivElement>(null)

  // 当卡片变化时重置状态
  useEffect(() => {
    if (prevCardKeyRef.current !== currentCardKey) {
      setShowAnswer(false)
      setShowCardInfo(false)
      prevCardKeyRef.current = currentCardKey
    }
  }, [currentCardKey])

  // 当 propsAllClozeContent 变化时更新状态
  useEffect(() => {
    if (propsAllClozeContent) {
      setAllClozeContent(propsAllClozeContent)
      console.log(`[${pluginName}] 从 props 接收 Cloze 内容:`, propsAllClozeContent)
    }
  }, [propsAllClozeContent, pluginName])

  // 从块树中提取所有 Cloze 内容（仅当 props 中没有提供时且是 BG 卡片）
  // 只有 BG 卡片才从块树中提取 cloze 内容，cloze 卡片不需要遍历子块树
  useEffect(() => {
    // 只有当 props 中没有提供 allClozeContent 且是 BG 卡片时，才从块树中提取
    if (!propsAllClozeContent && cardType === "bg") {
      const fetchAllClozeContent = async () => {
        try {
          const clozeContent = await extractClozeContentFromBlockTree(blockId, pluginName)
          setAllClozeContent(clozeContent)
          console.log(`[${pluginName}] 从块树提取到 Cloze 内容:`, clozeContent)
        } catch (error) {
          console.warn(`[${pluginName}] 尝试从块树提取 Cloze 内容失败:`, error)
        }
      }

      fetchAllClozeContent()
    }
  }, [blockId, pluginName, propsAllClozeContent, cardType])

  // 当组件挂载或更新时，移除 display: none 样式
  useEffect(() => {
    if (!blockContainerRef.current) return

    // 强制移除 display: none 样式的函数
    const removeDisplayNoneStyles = () => {
      // 移除 .orca-repr-main-none-editable 的 display: none 样式
      const noneEditableElements = blockContainerRef.current!.querySelectorAll('.orca-repr-main-none-editable')
      noneEditableElements.forEach((element: Element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.display = ''
        // 同时移除可能的其他隐藏样式
        htmlElement.style.visibility = ''
        htmlElement.style.opacity = ''
      })

      // 移除 .orca-block-handle 的 display: none 样式
      const blockHandles = blockContainerRef.current!.querySelectorAll('.orca-block-handle')
      blockHandles.forEach((element: Element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.display = ''
        // 同时移除可能的其他隐藏样式
        htmlElement.style.visibility = ''
        htmlElement.style.opacity = ''
      })

      // 移除 .orca-block-folding-handle 的 display: none 样式
      const foldingHandles = blockContainerRef.current!.querySelectorAll('.orca-block-folding-handle')
      foldingHandles.forEach((element: Element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.display = ''
        // 同时移除可能的其他隐藏样式
        htmlElement.style.visibility = ''
        htmlElement.style.opacity = ''
      })
    }

    // 立即执行一次
    removeDisplayNoneStyles()

    // 使用 requestAnimationFrame 确保 DOM 渲染完成后再次执行
    const animationId = requestAnimationFrame(removeDisplayNoneStyles)

    // 使用 setTimeout 确保样式移除代码能够执行
    const timeoutId = setTimeout(removeDisplayNoneStyles, 100)

    return () => {
      cancelAnimationFrame(animationId)
      clearTimeout(timeoutId)
    }
  }, [blockId])

  // 当答案显示状态变化时，处理挖空的遮盖
  useEffect(() => {
    if (!blockContainerRef.current) return

    console.log(`[${pluginName}] 处理挖空遮盖，showAnswer: ${showAnswer}, clozeNumber: ${clozeNumber}`)
    console.log(`[${pluginName}] allClozeContent:`, allClozeContent)

    // 使用 setTimeout 确保 DOM 完全渲染
    const timeoutId = setTimeout(() => {
      if (!blockContainerRef.current) return

      // 移除之前添加的所有遮罩
      const existingCovers = blockContainerRef.current.querySelectorAll('.srs-cloze-cover')
      existingCovers.forEach((cover: Element) => cover.remove())

      // 强制移除 display: none 样式
      const noneEditableElements = blockContainerRef.current.querySelectorAll('.orca-repr-main-none-editable')
      noneEditableElements.forEach((element: Element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.display = ''
      })

      const blockHandles = blockContainerRef.current.querySelectorAll('.orca-block-handle')
      blockHandles.forEach((element: Element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.display = ''
      })

      // 直接操作 DOM 元素，避免延迟
      // 使用更通用的选择器查找挖空元素
      const clozeElements = blockContainerRef.current.querySelectorAll('[data-cloze-number]')
      console.log(`[${pluginName}] 找到 ${clozeElements.length} 个挖空元素`)

      if (clozeElements.length > 0) {
        // 先清除之前可能添加的遮罩
        const existingCovers = blockContainerRef.current.querySelectorAll('.srs-cloze-cover')
        existingCovers.forEach((cover: Element) => cover.remove())
        
        clozeElements.forEach((element: Element, index: number) => {
          // 获取挖空元素的序号
          const elementClozeNumber = parseInt(element.getAttribute('data-cloze-number') || '0')
          const htmlElement = element as HTMLElement
          
          console.log(`[${pluginName}] 处理挖空元素 ${index}: number=${elementClozeNumber}, text=${htmlElement.textContent}`)
          
          if (!showAnswer && elementClozeNumber === clozeNumber) {
            // 答案未显示状态：直接替换挖空文本为 [...]
            // 保存原始文本，以便显示答案时恢复
            if (!htmlElement.getAttribute('data-original-text')) {
              htmlElement.setAttribute('data-original-text', htmlElement.textContent || '')
            }
            htmlElement.textContent = '[...]'
            htmlElement.style.color = 'var(--orca-color-text-2)'
            htmlElement.style.fontWeight = '500'
            htmlElement.style.border = '1px dashed var(--orca-color-border-1)'
            htmlElement.style.borderRadius = '4px'
            htmlElement.style.padding = '0 4px'
            htmlElement.style.backgroundColor = 'var(--orca-color-bg-2)'
            console.log(`[${pluginName}] 隐藏挖空元素 ${index}: ${elementClozeNumber}`)
          } else {
            // 答案显示状态或非当前序号的挖空
            if (showAnswer && elementClozeNumber === clozeNumber) {
              // 答案显示状态：恢复原始文本并添加蓝色样式
              const originalText = htmlElement.getAttribute('data-original-text')
              if (originalText) {
                htmlElement.textContent = originalText
                htmlElement.removeAttribute('data-original-text')
              }
              htmlElement.style.color = 'var(--orca-color-primary-5)'
              htmlElement.style.borderBottom = '2px solid var(--orca-color-primary-5)'
              htmlElement.style.fontWeight = '600'
              htmlElement.style.border = ''
              htmlElement.style.borderRadius = ''
              htmlElement.style.padding = ''
              htmlElement.style.backgroundColor = ''
              console.log(`[${pluginName}] 显示答案挖空元素 ${index}: ${elementClozeNumber}`)
            } else {
              // 非当前序号的挖空：保持原始样式
              htmlElement.style.color = '#999'
              htmlElement.style.borderBottom = '2px solid #4a90e2'
              htmlElement.style.fontWeight = ''
              htmlElement.style.border = ''
              htmlElement.style.borderRadius = ''
              htmlElement.style.padding = ''
              htmlElement.style.backgroundColor = ''
              console.log(`[${pluginName}] 保持挖空元素 ${index}: ${elementClozeNumber}`)
            }
          }
        })
      }
    }, 15) // 15ms 延迟，确保 DOM 完全渲染

    return () => clearTimeout(timeoutId)
  }, [showAnswer, blockId, clozeNumber, allClozeContent, pluginName])



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

  // 块数据可能只是尚未加载；不要误判为"已删除"
  if (!block) {
    return (
      <div style={{
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "32px",
        textAlign: "center",
        color: "var(--orca-color-text-2)"
      }}>
        <div style={{ fontSize: "14px", opacity: 0.75 }}>卡片加载中...</div>
      </div>
    )
  }

  // 从 block.content 中提取内容片段，并合并从块树中提取的 Cloze 内容
  const contentFragments = useMemo(() => {
    const originalFragments = block?.content ?? []
    
    // 检查原始片段中是否已经包含 Cloze 片段
    const hasClozeFragments = originalFragments.some((fragment: ContentFragment) => 
      fragment.t === `${pluginName}.cloze` || 
      (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
    )
    
    // 如果已经有 Cloze 片段，直接使用原始片段
    if (hasClozeFragments) {
      return originalFragments
    }
    
    // 如果没有 Cloze 片段，使用从块树中提取的内容
    // 注意：这里需要将 allClozeContent 转换为 ContentFragment 格式
    // 但由于我们没有完整的文本上下文，这里只是简单地返回原始片段
    // 实际的渲染逻辑会在下方处理
    return originalFragments
  }, [block?.content, pluginName, allClozeContent])

  // 渲染题目（隐藏当前填空编号的答案）
  const questionContent = useMemo(() => {
    return renderFragments(contentFragments, false, pluginName, clozeNumber, allClozeContent, cardType)
  }, [contentFragments, pluginName, clozeNumber, allClozeContent, cardType])

  // 渲染答案（显示所有填空）
  const answerContent = useMemo(() => {
    return renderFragments(contentFragments, true, pluginName, clozeNumber, allClozeContent, cardType)
  }, [contentFragments, pluginName, clozeNumber, allClozeContent, cardType])

  // 提取挖空位置信息，用于遮罩层
  const clozePositions = useMemo(() => {
    const positions: Array<{start: number; end: number; text: string}> = []
    let currentPosition = 0
    
    if (!contentFragments || contentFragments.length === 0) {
      // 如果没有内容片段，但有从块树中提取的 Cloze 内容，使用这些内容
      if (allClozeContent && allClozeContent.length > 0) {
        for (const item of allClozeContent) {
          const shouldHide = clozeNumber ? item.number === clozeNumber : true
          
          if (shouldHide) {
            positions.push({
              start: currentPosition,
              end: currentPosition + item.content.length,
              text: item.content
            })
          }
          
          currentPosition += item.content.length + 4 // 加上空格和分隔符的长度
        }
      }
      return positions
    }
    
    for (const fragment of contentFragments) {
      if (fragment.t === `${pluginName}.cloze`) {
        const fragmentClozeNumber = (fragment as any).clozeNumber
        const shouldHide = clozeNumber ? fragmentClozeNumber === clozeNumber : true
        
        if (shouldHide) {
          positions.push({
            start: currentPosition,
            end: currentPosition + (fragment.v?.length || 0),
            text: fragment.v || ""
          })
        }
        
        currentPosition += (fragment.v?.length || 0)
      } else if (fragment.t === "t") {
        currentPosition += (fragment.v?.length || 0)
      }
    }
    
    return positions
  }, [contentFragments, pluginName, clozeNumber, allClozeContent])

  const cardContent = (
    <div className="srs-cloze-card-container" style={{
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

      {/* 面包屑导航 */}
      {blockId && (
        <div style={{ 
          marginBottom: "12px", 
          fontSize: "12px", 
          color: "var(--orca-color-text-3)"
        }}>
          <BlockBreadcrumb blockId={blockId} />
        </div>
      )}

      {/* Block 组件原生显示 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
          <div 
            ref={blockContainerRef}
            className="srs-cloze-question" 
            style={{
              position: "relative"
            }}
          >
            {/* 恢复使用 Block 组件，确保内容能够正常显示 */}
            <Block
              blockId={blockId}
              panelId={panelId || "srs-review-panel"}
              blockLevel={0}
              indentLevel={0}
              renderingMode="normal"
              style={{
                border: "1px solid var(--orca-color-border-1)",
                borderRadius: "8px"
              }}
            />
          </div>
        </div>
      </div>

      {/* 显示答案按钮 / 评分按钮 */}
      {!showAnswer ? (
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px" }}>
          {/* 跳过按钮 - 在答案未显示时也可用 */}
          {onSkip && (
            <Button
              variant="outline"
              onClick={onSkip}
              title="跳过当前卡片，不评分"
              style={{
                padding: "12px 24px",
                fontSize: "16px"
              }}
            >
              跳过
            </Button>
          )}
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
            marginTop: "20px"
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
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.again)}</div>
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
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.hard)}</div>
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
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.good)}</div>
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
              <div style={{ fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }}>{formatDueDate(dueDates.easy)}</div>
              <span style={{ fontSize: "32px", lineHeight: "1" }}>😄</span>
              <span style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>简单</span>
            </button>
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
