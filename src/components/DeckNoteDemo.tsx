/**
 * 卡组备注功能演示组件
 * 
 * 展示卡组备注的各种使用场景和交互方式
 */

import type { DeckInfo } from "../srs/types"

const { useState } = window.React
const { Button } = orca.components

// 模拟卡组数据
const mockDecks: DeckInfo[] = [
  {
    name: "英语词汇",
    totalCount: 150,
    newCount: 20,
    overdueCount: 5,
    todayCount: 15,
    futureCount: 110,
    note: "重点学习高频词汇，每天复习30个单词"
  },
  {
    name: "日语语法",
    totalCount: 80,
    newCount: 10,
    overdueCount: 2,
    todayCount: 8,
    futureCount: 60,
    note: ""
  },
  {
    name: "数学公式",
    totalCount: 45,
    newCount: 5,
    overdueCount: 0,
    todayCount: 3,
    futureCount: 37,
    note: "包含微积分和线性代数的重要公式\n需要重点记忆推导过程"
  }
]

export default function DeckNoteDemo() {
  const [decks, setDecks] = useState<DeckInfo[]>(mockDecks)
  const [editingDeck, setEditingDeck] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")

  const handleEditNote = (deckName: string) => {
    const deck = decks.find((d: DeckInfo) => d.name === deckName)
    setNoteText(deck?.note || "")
    setEditingDeck(deckName)
  }

  const handleSaveNote = (deckName: string) => {
    setDecks((prev: DeckInfo[]) => prev.map((deck: DeckInfo) => 
      deck.name === deckName 
        ? { ...deck, note: noteText.trim() }
        : deck
    ))
    setEditingDeck(null)
    setNoteText("")
  }

  const handleCancelEdit = () => {
    setEditingDeck(null)
    setNoteText("")
  }

  return (
    <div style={{
      padding: "20px",
      maxWidth: "800px",
      margin: "0 auto"
    }}>
      <h2 style={{
        fontSize: "24px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        marginBottom: "20px"
      }}>
        卡组备注功能演示
      </h2>

      <div style={{
        marginBottom: "20px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          marginBottom: "8px"
        }}>
          功能说明
        </h3>
        <ul style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5",
          paddingLeft: "20px"
        }}>
          <li>点击备注按钮（📝）可以添加或编辑卡组备注</li>
          <li>点击现有备注内容可以快速编辑</li>
          <li>备注支持多行文本和特殊字符</li>
          <li>空备注会自动删除，保持数据整洁</li>
        </ul>
      </div>

      <div style={{
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        overflow: "hidden"
      }}>
        {/* 表头 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderBottom: "1px solid var(--orca-color-border-1)",
          fontWeight: 600,
          fontSize: "14px",
          color: "var(--orca-color-text-2)"
        }}>
          <div style={{ flex: 1 }}>卡组名称</div>
          <div style={{ width: "80px", textAlign: "center" }}>总数</div>
          <div style={{ width: "80px", textAlign: "center" }}>新卡</div>
          <div style={{ width: "80px", textAlign: "center" }}>待复习</div>
          <div style={{ width: "80px", textAlign: "center" }}>操作</div>
        </div>

        {/* 卡组列表 */}
        {decks.map((deck: DeckInfo) => (
          <div key={deck.name} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "12px",
              backgroundColor: "var(--orca-color-bg-1)",
              borderBottom: editingDeck === deck.name ? "none" : "1px solid var(--orca-color-border-1)"
            }}>
              {/* 卡组信息 */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "var(--orca-color-text-1)"
                }}>
                  {deck.name}
                </div>
                {deck.note && editingDeck !== deck.name && (
                  <div
                    onClick={() => handleEditNote(deck.name)}
                    style={{
                      fontSize: "13px",
                      color: "var(--orca-color-text-3)",
                      marginTop: "4px",
                      cursor: "pointer",
                      whiteSpace: "pre-wrap"
                    }}
                    title="点击编辑备注"
                  >
                    {deck.note}
                  </div>
                )}
              </div>

              {/* 统计数据 */}
              <div style={{
                width: "80px",
                textAlign: "center",
                fontSize: "14px",
                color: "var(--orca-color-text-2)"
              }}>
                {deck.totalCount}
              </div>
              <div style={{
                width: "80px",
                textAlign: "center",
                fontSize: "14px",
                color: deck.newCount > 0 ? "#3b82f6" : "#9ca3af"
              }}>
                {deck.newCount}
              </div>
              <div style={{
                width: "80px",
                textAlign: "center",
                fontSize: "14px",
                color: (deck.overdueCount + deck.todayCount) > 0 ? "#ef4444" : "#9ca3af"
              }}>
                {deck.overdueCount + deck.todayCount}
              </div>

              {/* 操作按钮 */}
              <div style={{
                width: "80px",
                textAlign: "center"
              }}>
                <Button
                  variant="plain"
                  onClick={() => handleEditNote(deck.name)}
                  style={{
                    padding: "6px",
                    minWidth: "auto",
                    fontSize: "16px"
                  }}
                  title={deck.note ? "编辑备注" : "添加备注"}
                >
                  📝
                </Button>
              </div>
            </div>

            {/* 编辑区域 */}
            {editingDeck === deck.name && (
              <div style={{
                padding: "12px",
                backgroundColor: "var(--orca-color-bg-2)",
                borderBottom: "1px solid var(--orca-color-border-1)"
              }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="输入卡组备注..."
                    style={{
                      width: "100%",
                      minHeight: "80px",
                      padding: "8px",
                      border: "1px solid var(--orca-color-border-1)",
                      borderRadius: "4px",
                      backgroundColor: "var(--orca-color-bg-1)",
                      color: "var(--orca-color-text-1)",
                      fontSize: "14px",
                      resize: "vertical",
                      fontFamily: "inherit"
                    }}
                    autoFocus
                  />
                  <div style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end"
                  }}>
                    <Button
                      variant="plain"
                      onClick={handleCancelEdit}
                      style={{ fontSize: "13px", padding: "6px 12px" }}
                    >
                      取消
                    </Button>
                    <Button
                      variant="solid"
                      onClick={() => handleSaveNote(deck.name)}
                      style={{ fontSize: "13px", padding: "6px 12px" }}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "20px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)"
      }}>
        <h3 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
          marginBottom: "8px"
        }}>
          备注示例
        </h3>
        <div style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5"
        }}>
          <p><strong>学习计划：</strong>"每天学习20个新单词，重点复习错误率高的词汇"</p>
          <p><strong>内容说明：</strong>"包含TOEFL核心词汇，按难度分级"</p>
          <p><strong>进度追踪：</strong>"已完成第一轮复习，准备开始第二轮强化"</p>
          <p><strong>提醒事项：</strong>"注意区分近义词，重点记忆词根词缀"</p>
        </div>
      </div>
    </div>
  )
}