/**
 * SRS 卡片块渲染器
 *
 * 功能：
 * - 在 Orca 编辑器中以自定义样式渲染 SRS 卡片块
 * - 显示题目（front）和答案（back）
 * - 提供评分按钮（用于快速复习）
 * - 显示 SRS 状态信息（下次复习时间、复习次数等）
 *
 * 用法：
 * - 块的 _repr.type 必须为 "srs.card"
 * - _repr.front: 题目文本
 * - _repr.back: 答案文本
 */

import type { Block, DbId } from "../orca.d.ts"
import type { Grade } from "../srs/types"
import { updateSrsState } from "../srs/storage"
import SrsErrorBoundary from "./SrsErrorBoundary"
import { showNotification } from "../srs/settings/reviewSettingsSchema"

// 从全局 window 对象获取 React
const { useState, useMemo, useEffect, useCallback } = window.React
const { useSnapshot } = window.Valtio
const { BlockShell, BlockChildren, Button, BlockBreadcrumb } = orca.components

// 组件 Props 类型定义
type SrsCardBlockRendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
  front: string  // 题目（从 _repr 接收）
  back: string   // 答案（从 _repr 接收）
}

export default function SrsCardBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode,
  front,
  back,
}: SrsCardBlockRendererProps) {
  // 订阅 orca.state，Valtio 会自动追踪实际访问的属性
  const snapshot = useSnapshot(orca.state)
  const targetBlockId = mirrorId ?? blockId

  // 使用 useMemo 缓存派生数据，明确依赖关系
  const block = useMemo(() => {
    return snapshot?.blocks?.[targetBlockId]
  }, [snapshot?.blocks, targetBlockId])

  // 移除未使用的 srsInfo 计算以提升性能

  // 状态：是否显示答案
  const [showAnswer, setShowAnswer] = useState(false)
  const [isEditingFront, setIsEditingFront] = useState(false)
  const [isEditingBack, setIsEditingBack] = useState(false)
  const [editedFront, setEditedFront] = useState(front)
  const [editedBack, setEditedBack] = useState(back)
  const [frontDisplay, setFrontDisplay] = useState(front)
  const [backDisplay, setBackDisplay] = useState(back)
  const [isSavingFront, setIsSavingFront] = useState(false)
  const [isSavingBack, setIsSavingBack] = useState(false)

  const toFragments = (textValue: string) => [{ t: "t", v: textValue ?? "" }]

  // 当 blockId 变化时重置所有状态（处理删除标签后重新添加的情况）
  useEffect(() => {
    setShowAnswer(false)
    setIsEditingFront(false)
    setIsEditingBack(false)
    setFrontDisplay(front)
    setBackDisplay(back)
    setEditedFront(front)
    setEditedBack(back)
  }, [blockId, front, back])

  useEffect(() => {
    setFrontDisplay(front)
    setEditedFront(front)
    setIsEditingFront(false)
  }, [front])

  useEffect(() => {
    setBackDisplay(back)
    setEditedBack(back)
    setIsEditingBack(false)
  }, [back])

  /**
   * 处理评分按钮点击
   * @param grade 评分等级
   */
  const handleGrade = useCallback(async (grade: Grade) => {
    console.log(`[SRS Card Block Renderer] 卡片 #${blockId} 评分: ${grade}`)

    const result = await updateSrsState(blockId, grade, "orca-srs")

    // 评分后隐藏答案
    setShowAnswer(false)

    // 显示通知
    const formatSimpleDate = (date: Date) => {
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}-${day}`
    }
    showNotification(
      "orca-srs",
      "success",
      `评分已记录：${grade}，下次 ${formatSimpleDate(result.state.due)}（间隔 ${result.state.interval} 天）`,
      { title: "SRS 复习" }
    )
  }, [blockId])

  const handleSaveFront = useCallback(async () => {
    if (isSavingFront) return
    setIsSavingFront(true)
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: targetBlockId, content: toFragments(editedFront) }],
        false
      )

      const liveBlock = orca.state.blocks?.[targetBlockId] as any
      if (liveBlock) {
        liveBlock.text = editedFront
        if (liveBlock._repr) {
          liveBlock._repr.front = editedFront
        }
      }

      setFrontDisplay(editedFront)
      setIsEditingFront(false)
      showNotification("orca-srs", "success", "题目已保存", { title: "SRS 卡片" })
    } catch (error) {
      console.error("保存题目失败:", error)
      orca.notify("error", `保存失败: ${error}`)
    } finally {
      setIsSavingFront(false)
    }
  }, [targetBlockId, editedFront, isSavingFront])

  const handleSaveBack = useCallback(async () => {
    if (isSavingBack) return
    const answerId = block?.children?.[0]
    if (answerId === undefined) {
      orca.notify("warn", "该卡片没有子块，无法保存答案", { title: "SRS 卡片" })
      return
    }

    setIsSavingBack(true)
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: answerId, content: toFragments(editedBack) }],
        false
      )

      const answerBlock = orca.state.blocks?.[answerId] as any
      if (answerBlock) {
        answerBlock.text = editedBack
      }

      const liveBlock = orca.state.blocks?.[targetBlockId] as any
      if (liveBlock && liveBlock._repr) {
        liveBlock._repr.back = editedBack
      }

      setBackDisplay(editedBack)
      setIsEditingBack(false)
      showNotification("orca-srs", "success", "答案已保存", { title: "SRS 卡片" })
    } catch (error) {
      console.error("保存答案失败:", error)
      orca.notify("error", `保存失败: ${error}`)
    } finally {
      setIsSavingBack(false)
    }
  }, [block?.children, targetBlockId, editedBack, isSavingBack])

  const handleCancelEdit = useCallback((field: "front" | "back") => {
    if (field === "front") {
      setEditedFront(front)
      setIsEditingFront(false)
    } else {
      setEditedBack(back)
      setIsEditingBack(false)
    }
  }, [front, back])

  const handleFrontChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedFront(e.target.value)
  }, [])

  const handleBackChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedBack(e.target.value)
  }, [])

  // 阻止特定事件冒泡，但允许复制粘贴等操作
  const handleTextareaMouseDown = useCallback((e: React.MouseEvent) => {
    // 只阻止冒泡，不阻止默认行为
    e.stopPropagation()
  }, [])

  const handleTextareaClick = useCallback((e: React.MouseEvent) => {
    // 只阻止冒泡，不阻止默认行为
    e.stopPropagation()
  }, [])

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 允许复制粘贴等快捷键，只阻止可能干扰编辑器的按键
    // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A 等不阻止
    const isCopyPaste = e.ctrlKey || e.metaKey
    if (!isCopyPaste) {
      e.stopPropagation()
    }
  }, [])

  // 渲染子块（如果有的话）- 优化依赖项以避免不必要的重渲染
  const childrenJsx = useMemo(
    () => (
      <BlockChildren
        block={block as Block}
        panelId={panelId}
        blockLevel={blockLevel}
        indentLevel={indentLevel}
        renderingMode={renderingMode}
      />
    ),
    [block, panelId, blockLevel, indentLevel, renderingMode]
  )

  // 判断是否有子块（答案块）
  const hasChildren = useMemo(() => {
    return block?.children && block.children.length > 0
  }, [block?.children])

  // 卡片内容 JSX - 使用 useMemo 避免在隐藏时重新渲染
  const contentJsx = useMemo(() => (
    <div
      className="srs-card-block-content"
      style={{
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "4px",
        marginBottom: "4px",
        userSelect: "text",
        WebkitUserSelect: "text",
      }}
    >
      {/* 折叠按钮和句柄仅在直接悬浮到对应块时显示 */}
      <style>{`
        .srs-card-block-content .orca-block-folding-handle,
        .srs-card-block-content .orca-block-handle {
          opacity: 0 !important;
          transition: opacity 0.15s ease;
        }
        .srs-card-block-content .orca-block.orca-container:hover > .orca-repr > .orca-repr-main > .orca-repr-main-none-editable > .orca-block-handle,
        .srs-card-block-content .orca-block.orca-container:hover > .orca-block-folding-handle {
          opacity: 1 !important;
        }
        .srs-card-front .orca-repr-main {
          display: block !important;
        }
      `}</style>
      
      {/* 卡片图标 + 标题 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          color: "var(--orca-color-text-2)",
          fontSize: "12px",
          fontWeight: "500",
        }}
      >
        <i className="ti ti-cards" style={{ fontSize: "16px" }}></i>
        <span>SRS 记忆卡片</span>
      </div>

      {/* 题目区域 */}
      <div
        className="srs-card-front"
        style={{
          marginBottom: "12px",
          padding: "12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "6px",
          color: "var(--orca-color-text-1)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* 面包屑导航 - 使用原生组件 */}
        <BlockBreadcrumb blockId={targetBlockId} />
        
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--orca-color-text-2)",
          }}
        >
          <span>题目：</span>
          {!isEditingFront && (
            <Button
              variant="soft"
              onClick={() => setIsEditingFront(true)}
              style={{ padding: "2px 8px", fontSize: "11px" }}
            >
              <i className="ti ti-edit"></i> 编辑
            </Button>
          )}
        </div>
        {isEditingFront ? (
          <>
            <textarea
              value={editedFront}
              onChange={handleFrontChange}
              onInput={handleFrontChange}
              onMouseDown={handleTextareaMouseDown}
              onClick={handleTextareaClick}
              onKeyDown={handleTextareaKeyDown}
              autoFocus
              readOnly={false}
              disabled={false}
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "8px",
                fontSize: "14px",
                borderRadius: "4px",
                border: "1px solid var(--orca-color-border-1)",
                resize: "vertical",
                pointerEvents: "auto",
                userSelect: "text",
                WebkitUserSelect: "text",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <Button variant="soft" onClick={() => handleCancelEdit("front")}>
                取消
              </Button>
              <Button variant="solid" onClick={handleSaveFront}>
                保存
              </Button>
            </div>
          </>
        ) : (
          <div 
            style={{ 
              whiteSpace: "pre-wrap",
              userSelect: "text",
              WebkitUserSelect: "text",
              cursor: "text",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            {frontDisplay || "（无题目）"}
          </div>
        )}
      </div>

      {/* 显示答案按钮 或 答案区域 或 直接显示评分按钮（摘录卡） */}
      {hasChildren ? (
        // 有子块：显示答案逻辑
        !showAnswer ? (
          // 未显示答案：显示按钮
          <div style={{ textAlign: "center" }}>
            <Button
              variant="soft"
              onClick={() => setShowAnswer(true)}
              style={{
                padding: "6px 16px",
                fontSize: "13px",
              }}
            >
              显示答案
            </Button>
          </div>
        ) : (
          // 已显示答案：显示答案和评分按钮
          <>
            {/* 答案区域 */}
            <div
              className="srs-card-back"
              style={{
                marginBottom: "12px",
                padding: "12px",
                backgroundColor: "var(--orca-color-bg-2)",
                borderRadius: "6px",
                color: "var(--orca-color-text-1)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--orca-color-text-2)",
                }}
              >
                <span>答案：</span>
                {!isEditingBack && (
                  <Button
                    variant="soft"
                    onClick={() => setIsEditingBack(true)}
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                  >
                    <i className="ti ti-edit"></i> 编辑
                  </Button>
                )}
              </div>
              {isEditingBack ? (
                <>
                  <textarea
                    value={editedBack}
                    onChange={handleBackChange}
                    onInput={handleBackChange}
                    onMouseDown={handleTextareaMouseDown}
                    onClick={handleTextareaClick}
                    onKeyDown={handleTextareaKeyDown}
                    autoFocus
                    readOnly={false}
                    disabled={false}
                    style={{
                      width: "100%",
                      minHeight: "80px",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "4px",
                      border: "1px solid var(--orca-color-border-1)",
                      resize: "vertical",
                      pointerEvents: "auto",
                      userSelect: "text",
                      WebkitUserSelect: "text",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button variant="soft" onClick={() => handleCancelEdit("back")}>
                      取消
                    </Button>
                    <Button variant="solid" onClick={handleSaveBack}>
                      保存
                    </Button>
                  </div>
                </>
              ) : (
                <div 
                  style={{ 
                    whiteSpace: "pre-wrap",
                    userSelect: "text",
                    WebkitUserSelect: "text",
                    cursor: "text",
                    fontSize: "20px",
                    fontWeight: "600",
                  }}
                >
                  {backDisplay || "（无答案）"}
                </div>
              )}
            </div>

            {/* 评分按钮组 */}
            <div
              className="srs-card-grade-buttons"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px",
              }}
            >
              {/* Again 按钮 */}
              <Button
                variant="dangerous"
                onClick={() => handleGrade("again")}
                style={{
                  padding: "12px 4px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: "500" }}>1m</span>
                <span style={{ fontSize: "32px" }}>😞</span>
                <span style={{ fontSize: "11px", opacity: 0.9 }}>忘记</span>
              </Button>

              {/* Hard 按钮 */}
              <Button
                variant="soft"
                onClick={() => handleGrade("hard")}
                style={{
                  padding: "12px 4px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: "500" }}>6m</span>
                <span style={{ fontSize: "32px" }}>😐</span>
                <span style={{ fontSize: "11px", opacity: 0.9 }}>困难</span>
              </Button>

              {/* Good 按钮 */}
              <Button
                variant="solid"
                onClick={() => handleGrade("good")}
                style={{
                  padding: "12px 4px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: "500" }}>10m</span>
                <span style={{ fontSize: "32px" }}>😊</span>
                <span style={{ fontSize: "11px", opacity: 0.9 }}>良好</span>
              </Button>

              {/* Easy 按钮 */}
              <Button
                variant="solid"
                onClick={() => handleGrade("easy")}
                style={{
                  padding: "12px 4px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  backgroundColor: "var(--orca-color-primary-5)",
                  opacity: 0.9,
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: "500" }}>8d</span>
                <span style={{ fontSize: "32px" }}>😄</span>
                <span style={{ fontSize: "11px", opacity: 0.9 }}>简单</span>
              </Button>
            </div>
          </>
        )
      ) : (
        // 无子块（摘录卡）：直接显示评分按钮
        <div
          className="srs-card-grade-buttons"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px",
          }}
        >
          {/* Again 按钮 */}
          <Button
            variant="dangerous"
            onClick={() => handleGrade("again")}
            style={{
              padding: "12px 4px",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "500" }}>1m</span>
            <span style={{ fontSize: "32px" }}>😞</span>
            <span style={{ fontSize: "11px", opacity: 0.9 }}>忘记</span>
          </Button>

          {/* Hard 按钮 */}
          <Button
            variant="soft"
            onClick={() => handleGrade("hard")}
            style={{
              padding: "12px 4px",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "500" }}>6m</span>
            <span style={{ fontSize: "32px" }}>😐</span>
            <span style={{ fontSize: "11px", opacity: 0.9 }}>困难</span>
          </Button>

          {/* Good 按钮 */}
          <Button
            variant="solid"
            onClick={() => handleGrade("good")}
            style={{
              padding: "12px 4px",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "500" }}>10m</span>
            <span style={{ fontSize: "32px" }}>😊</span>
            <span style={{ fontSize: "11px", opacity: 0.9 }}>良好</span>
          </Button>

          {/* Easy 按钮 */}
          <Button
            variant="solid"
            onClick={() => handleGrade("easy")}
            style={{
              padding: "12px 4px",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              backgroundColor: "var(--orca-color-primary-5)",
              opacity: 0.9,
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "500" }}>8d</span>
            <span style={{ fontSize: "32px" }}>😄</span>
            <span style={{ fontSize: "11px", opacity: 0.9 }}>简单</span>
          </Button>
        </div>
      )}

      {/* SRS 详细信息已隐藏 */}
    </div>
  ), [
    hasChildren,
    showAnswer,
    isEditingFront,
    isEditingBack,
    editedFront,
    editedBack,
    frontDisplay,
    backDisplay,
    isSavingFront,
    isSavingBack,
    handleGrade,
    handleSaveFront,
    handleSaveBack,
    handleCancelEdit,
    handleFrontChange,
    handleBackChange,
    handleTextareaMouseDown,
    handleTextareaClick,
    handleTextareaKeyDown,
  ])

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
      reprClassName="srs-repr-card"
      contentClassName="srs-repr-card-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={
        <SrsErrorBoundary componentName="SRS卡片" errorTitle="卡片加载出错">
          {contentJsx}
        </SrsErrorBoundary>
      }
      childrenJsx={childrenJsx}
    />
  )
}
