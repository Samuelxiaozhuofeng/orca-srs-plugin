/**
 * SRS 卡片演示组件
 *
 * 功能：
 * - 初始显示题目(front)和"显示答案"按钮
 * - 点击后显示答案(back)和四个评分按钮
 * - 点击评分按钮会调用 onGrade 回调（已接入真实 SRS）
 */

// 从全局 window 对象获取 React（Orca 插件约定）
const { useState, useEffect } = window.React
const { Button, ModalOverlay } = orca.components

import type { DbId } from "../orca.d.ts"
import type { Grade, SrsState } from "../srs/types"

// 组件 Props 类型定义
type SrsCardDemoProps = {
  front: string  // 题目文本
  back: string   // 答案文本
  onGrade: (grade: Grade) => Promise<void> | void  // 评分回调
  onClose?: () => void  // 关闭回调
  srsInfo?: Partial<SrsState>  // 显示在卡片底部的 SRS 信息
  isGrading?: boolean         // 正在写入 SRS 状态时禁用按钮
  blockId?: DbId              // 块 ID，用于跳转与编辑
  onJumpToCard?: (blockId: DbId) => void
  inSidePanel?: boolean
}

export default function SrsCardDemo({
  front,
  back,
  onGrade,
  onClose,
  srsInfo,
  isGrading = false,
  blockId,
  onJumpToCard,
  inSidePanel = false
}: SrsCardDemoProps) {
  // 状态：是否已显示答案
  const [showAnswer, setShowAnswer] = useState(false)
  const [isEditingFront, setIsEditingFront] = useState(false)
  const [isEditingBack, setIsEditingBack] = useState(false)
  const [editedFront, setEditedFront] = useState(front)
  const [editedBack, setEditedBack] = useState(back)
  const [displayFront, setDisplayFront] = useState(front)
  const [displayBack, setDisplayBack] = useState(back)
  const [isSavingFront, setIsSavingFront] = useState(false)
  const [isSavingBack, setIsSavingBack] = useState(false)

  const stripHashTags = (text: string) => {
    if (!text) return ""
    return text.replace(/#[\w/\u4e00-\u9fa5]+/g, "").trim()
  }

  const getBlockById = () => {
    if (!blockId) return null
    return orca.state.blocks?.[blockId] as any
  }

  const getFrontRaw = () => {
    const block = getBlockById()
    if (block?._repr?.front) return block._repr.front
    return block?.text ?? front
  }

  const getBackRaw = () => {
    const block = getBlockById()
    if (block?._repr?.back) return block._repr.back
    const firstChildId = block?.children?.[0]
    if (firstChildId !== undefined) {
      const firstChild = orca.state.blocks?.[firstChildId] as any
      return firstChild?.text ?? back
    }
    return back
  }

  const toFragments = (textValue: string) => [{ t: "t", v: textValue ?? "" }]

  useEffect(() => {
    setDisplayFront(front)
    setEditedFront(getFrontRaw())
    setIsEditingFront(false)
  }, [front, blockId])

  useEffect(() => {
    setDisplayBack(back)
    setEditedBack(getBackRaw())
    setIsEditingBack(false)
  }, [back, blockId])

  /**
   * 处理评分按钮点击
   * @param grade 评分等级
   */
  const handleGrade = async (grade: Grade) => {
    if (isGrading) return
    console.log(`[SRS Card Demo] 用户选择评分: ${grade}`)
    await onGrade(grade)
    setShowAnswer(false) // 评分后重置，准备下一张卡片
  }

  const handleSaveFront = async () => {
    if (!blockId || isSavingFront) return
    setIsSavingFront(true)
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: blockId, content: toFragments(editedFront) }],
        false
      )

      const block = getBlockById()
      if (block) {
        block.text = editedFront
        if (block._repr) {
          block._repr.front = editedFront
        }
      }

      setDisplayFront(stripHashTags(editedFront))
      setIsEditingFront(false)
      orca.notify("success", "题目已保存", { title: "SRS 复习" })
    } catch (error) {
      console.error("保存题目失败:", error)
      orca.notify("error", `保存失败: ${error}`)
    } finally {
      setIsSavingFront(false)
    }
  }

  const handleSaveBack = async () => {
    if (!blockId || isSavingBack) return
    const block = getBlockById()
    const firstChildId = block?.children?.[0]
    if (firstChildId === undefined) {
      orca.notify("warn", "卡片没有子块，无法保存答案", { title: "SRS 复习" })
      return
    }

    setIsSavingBack(true)
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: firstChildId, content: toFragments(editedBack) }],
        false
      )

      const answerBlock = orca.state.blocks?.[firstChildId] as any
      if (answerBlock) {
        answerBlock.text = editedBack
      }
      if (block && block._repr) {
        block._repr.back = editedBack
      }

      setDisplayBack(stripHashTags(editedBack))
      setIsEditingBack(false)
      orca.notify("success", "答案已保存", { title: "SRS 复习" })
    } catch (error) {
      console.error("保存答案失败:", error)
      orca.notify("error", `保存失败: ${error}`)
    } finally {
      setIsSavingBack(false)
    }
  }

  const handleCancelEdit = (field: "front" | "back") => {
    if (field === "front") {
      setEditedFront(getFrontRaw())
      setIsEditingFront(false)
    } else {
      setEditedBack(getBackRaw())
      setIsEditingBack(false)
    }
  }

  const cardContent = (
    <div className="srs-card-container" style={{
      backgroundColor: 'var(--orca-color-bg-1)',
      borderRadius: '12px',
      padding: '32px',
      maxWidth: inSidePanel ? '720px' : '600px',
      width: inSidePanel ? '100%' : '90%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      margin: inSidePanel ? '0 auto' : undefined
    }}>

        {/* 工具栏：跳转按钮 */}
        {blockId && onJumpToCard && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '12px'
          }}>
            <Button
              variant="soft"
              onClick={() => onJumpToCard(blockId)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <i className="ti ti-arrow-right" />
              跳转到卡片
            </Button>
          </div>
        )}

        {/* 题目区域 */}
        <div className="srs-card-front" style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: 'var(--orca-color-bg-2)',
          borderRadius: '8px',
          minHeight: '100px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '500',
              color: 'var(--orca-color-text-1)'
            }}>
              题目
            </div>
            {blockId && !isEditingFront && (
              <Button
                variant="soft"
                onClick={() => setIsEditingFront(true)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                <i className="ti ti-edit" /> 编辑
              </Button>
            )}
          </div>
          {isEditingFront ? (
            <>
              <textarea
                value={editedFront}
                onChange={(e) => setEditedFront(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px',
                  fontSize: '16px',
                  borderRadius: '4px',
                  border: '1px solid var(--orca-color-border-1)',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="soft" onClick={() => handleCancelEdit("front")}>
                  取消
                </Button>
                <Button variant="solid" onClick={handleSaveFront}>
                  保存
                </Button>
              </div>
            </>
          ) : (
            <div style={{
              fontSize: '18px',
              fontWeight: '500',
              color: 'var(--orca-color-text-1)',
              textAlign: 'center',
              whiteSpace: 'pre-wrap'
            }}>
              {displayFront}
            </div>
          )}
        </div>

        {/* 显示答案按钮 或 答案区域 */}
        {!showAnswer ? (
          // 未显示答案时：显示"显示答案"按钮
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <Button
              variant="solid"
              onClick={() => setShowAnswer(true)}
              style={{
                padding: '12px 32px',
                fontSize: '16px'
              }}
            >
              显示答案
            </Button>
          </div>
        ) : (
          // 已显示答案时：显示答案内容和评分按钮
          <>
            {/* 答案区域 */}
            <div className="srs-card-back" style={{
              marginBottom: '24px',
              padding: '20px',
              backgroundColor: 'var(--orca-color-bg-2)',
              borderRadius: '8px',
              minHeight: '100px',
              borderLeft: '4px solid var(--orca-color-primary-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  fontSize: '14px',
                  color: 'var(--orca-color-text-2)',
                  fontWeight: '500'
                }}>
                  答案：
                </div>
                {blockId && !isEditingBack && (
                  <Button
                    variant="soft"
                    onClick={() => setIsEditingBack(true)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    <i className="ti ti-edit" /> 编辑
                  </Button>
                )}
              </div>
              {isEditingBack ? (
                <>
                  <textarea
                    value={editedBack}
                    onChange={(e) => setEditedBack(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '80px',
                      padding: '8px',
                      fontSize: '16px',
                      borderRadius: '4px',
                      border: '1px solid var(--orca-color-border-1)',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Button variant="soft" onClick={() => handleCancelEdit("back")}>
                      取消
                    </Button>
                    <Button variant="solid" onClick={handleSaveBack}>
                      保存
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{
                  fontSize: '16px',
                  color: 'var(--orca-color-text-1)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {displayBack}
                </div>
              )}
            </div>

            {/* 评分按钮组 */}
            <div className="srs-card-grade-buttons" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px'
            }}>
              {/* Again 按钮 - 完全忘记 */}
              <Button
                variant="dangerous"
                onClick={() => handleGrade("again")}
                style={{
                  padding: '12px 8px',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: '600' }}>Again</span>
                <span style={{ fontSize: '12px', opacity: 0.8 }}>忘记</span>
              </Button>

              {/* Hard 按钮 - 困难 */}
              <Button
                variant="soft"
                onClick={() => handleGrade("hard")}
                style={{
                  padding: '12px 8px',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: '600' }}>Hard</span>
                <span style={{ fontSize: '12px', opacity: 0.8 }}>困难</span>
              </Button>

              {/* Good 按钮 - 良好 */}
              <Button
                variant="solid"
                onClick={() => handleGrade("good")}
                style={{
                  padding: '12px 8px',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: '600' }}>Good</span>
                <span style={{ fontSize: '12px', opacity: 0.8 }}>良好</span>
              </Button>

              {/* Easy 按钮 - 简单 */}
              <Button
                variant="solid"
                onClick={() => handleGrade("easy")}
                style={{
                  padding: '12px 8px',
                  fontSize: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'var(--orca-color-primary-5)',
                  opacity: 0.9
                }}
              >
                <span style={{ fontWeight: '600' }}>Easy</span>
                <span style={{ fontSize: '12px', opacity: 0.8 }}>简单</span>
              </Button>
            </div>
          </>
        )}

        {/* 提示文本 */}
        <div style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--orca-color-text-2)',
          opacity: 0.7
        }}>
          {!showAnswer ? '点击"显示答案"查看答案内容' : '根据记忆程度选择评分'}
        </div>

        {srsInfo && (
          <div style={{
            marginTop: '16px',
            fontSize: '12px',
            color: 'var(--orca-color-text-2)',
            backgroundColor: 'var(--orca-color-bg-2)',
            padding: '10px 12px',
            borderRadius: '8px'
          }}>
            <div>下次复习：{srsInfo.due ? new Date(srsInfo.due).toLocaleString() : "未安排"}</div>
            <div style={{ marginTop: '6px' }}>
              间隔：{srsInfo.interval ?? "-"} 天 / 稳定度：{srsInfo.stability?.toFixed ? srsInfo.stability.toFixed(2) : srsInfo.stability} / 难度：{srsInfo.difficulty?.toFixed ? srsInfo.difficulty.toFixed(2) : srsInfo.difficulty}
            </div>
            <div style={{ marginTop: '4px' }}>
              已复习：{srsInfo.reps ?? 0} 次，遗忘：{srsInfo.lapses ?? 0} 次
            </div>
          </div>
        )}
      </div>
  )

  if (inSidePanel) {
    return (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        {cardContent}
      </div>
    )
  }

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={onClose}
      className="srs-card-modal"
    >
      {cardContent}
    </ModalOverlay>
  )
}
