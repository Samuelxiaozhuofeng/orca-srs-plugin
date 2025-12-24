/**
 * 卡组搜索功能演示组件
 * 
 * 展示卡组搜索的各种功能和交互方式
 */

import type { DeckInfo } from "../srs/types"

const { useState, useMemo, useRef, useEffect } = window.React
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
    note: "重点学习高频词汇，每天复习30个单词。包含TOEFL核心词汇。"
  },
  {
    name: "日语语法",
    totalCount: 80,
    newCount: 10,
    overdueCount: 2,
    todayCount: 8,
    futureCount: 60,
    note: "N2级别语法点，重点掌握敬语和时态变化"
  },
  {
    name: "数学公式",
    totalCount: 45,
    newCount: 5,
    overdueCount: 0,
    todayCount: 3,
    futureCount: 37,
    note: "包含微积分和线性代数的重要公式\n需要重点记忆推导过程"
  },
  {
    name: "历史知识点",
    totalCount: 120,
    newCount: 15,
    overdueCount: 8,
    todayCount: 12,
    futureCount: 85,
    note: "中国古代史重点内容，按朝代整理"
  },
  {
    name: "编程概念",
    totalCount: 200,
    newCount: 25,
    overdueCount: 10,
    todayCount: 20,
    futureCount: 145,
    note: "计算机科学基础概念，包含算法和数据结构"
  },
  {
    name: "医学术语",
    totalCount: 300,
    newCount: 40,
    overdueCount: 15,
    todayCount: 25,
    futureCount: 220,
    note: "医学专业术语，重点记忆解剖学和生理学相关内容"
  }
]

// 高亮文本组件
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>
  }

  const parts = text.split(new RegExp(`(${query})`, "gi"))
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={index} style={{
            backgroundColor: "var(--orca-color-warning-2)",
            color: "var(--orca-color-warning-7)",
            fontWeight: 600,
            padding: "0 2px",
            borderRadius: "2px"
          }}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

export default function DeckSearchDemo() {
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 搜索过滤逻辑
  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) {
      return mockDecks
    }

    const query = searchQuery.toLowerCase().trim()
    return mockDecks.filter((deck: DeckInfo) => {
      const nameMatch = deck.name.toLowerCase().includes(query)
      const noteMatch = deck.note?.toLowerCase().includes(query) || false
      return nameMatch || noteMatch
    })
  }, [searchQuery])

  // 计算搜索统计
  const searchStats = useMemo(() => {
    const totalCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.totalCount, 0)
    const newCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.newCount, 0)
    const pendingCards = filteredDecks.reduce((sum: number, deck: DeckInfo) => sum + deck.overdueCount + deck.todayCount, 0)

    return {
      deckCount: filteredDecks.length,
      totalCards,
      newCards,
      pendingCards
    }
  }, [filteredDecks])

  // 清空搜索
  const handleClearSearch = () => {
    setSearchQuery("")
    searchInputRef.current?.focus()
  }

  // 移除全局键盘快捷键支持，避免与浏览器默认功能冲突

  // 预设搜索示例
  const searchExamples = [
    { label: "英语", description: "搜索英语相关卡组" },
    { label: "重点", description: "搜索备注中的重点内容" },
    { label: "公式", description: "搜索数学公式卡组" },
    { label: "TOEFL", description: "搜索备注中的TOEFL内容" }
  ]

  return (
    <div style={{
      padding: "20px",
      maxWidth: "900px",
      margin: "0 auto"
    }}>
      <h2 style={{
        fontSize: "24px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        marginBottom: "20px"
      }}>
        卡组搜索功能演示
      </h2>

      {/* 功能说明 */}
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
          功能特性
        </h3>
        <ul style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5",
          paddingLeft: "20px"
        }}>
          <li>实时搜索卡组名称和备注内容</li>
          <li>搜索结果高亮显示匹配关键词</li>
          <li>按 Escape 键清空搜索内容</li>
          <li>动态显示搜索结果统计</li>
        </ul>
      </div>

      {/* 搜索栏 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border-1)",
        marginBottom: "16px"
      }}>
        <i className="ti ti-search" style={{
          fontSize: "16px",
          color: "var(--orca-color-text-3)"
        }} />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索卡组名称或备注内容..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            color: "var(--orca-color-text-1)",
            fontSize: "14px",
            padding: "4px 0"
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleClearSearch()
            }
          }}
        />
        {searchQuery && (
          <Button
            variant="plain"
            onClick={handleClearSearch}
            style={{
              padding: "4px",
              minWidth: "auto",
              fontSize: "14px",
              color: "var(--orca-color-text-3)"
            }}
            title="清空搜索"
          >
            <i className="ti ti-x" />
          </Button>
        )}
      </div>

      {/* 搜索示例 */}
      <div style={{
        marginBottom: "16px",
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <span style={{
          fontSize: "13px",
          color: "var(--orca-color-text-3)"
        }}>
          试试搜索：
        </span>
        {searchExamples.map(example => (
          <button
            key={example.label}
            onClick={() => setSearchQuery(example.label)}
            style={{
              padding: "4px 8px",
              borderRadius: "12px",
              border: "1px solid var(--orca-color-border-1)",
              backgroundColor: "var(--orca-color-bg-1)",
              color: "var(--orca-color-text-2)",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            title={example.description}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--orca-color-primary-1)"
              e.currentTarget.style.borderColor = "var(--orca-color-primary-4)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
              e.currentTarget.style.borderColor = "var(--orca-color-border-1)"
            }}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* 搜索统计 */}
      <div style={{
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "6px",
        border: "1px solid var(--orca-color-border-1)",
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        textAlign: "center"
      }}>
        {searchQuery.trim() ? (
          <div>
            <div>搜索结果：{searchStats.deckCount} 个卡组，{searchStats.totalCards} 张卡片</div>
            <div style={{ marginTop: "2px", opacity: 0.8 }}>
              {searchStats.newCards} 张新卡，{searchStats.pendingCards} 张待复习
            </div>
          </div>
        ) : (
          <div>
            共 {mockDecks.length} 个卡组，{mockDecks.reduce((sum, deck) => sum + deck.totalCount, 0)} 张卡片
          </div>
        )}
      </div>

      {/* 卡组列表 */}
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
        </div>

        {/* 卡组列表 */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filteredDecks.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "24px",
              color: "var(--orca-color-text-3)"
            }}>
              <div style={{ marginBottom: "8px" }}>
                <i className="ti ti-search-off" style={{ fontSize: "24px", opacity: 0.5 }} />
              </div>
              <div>未找到匹配的卡组</div>
              <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>
                尝试搜索卡组名称或备注内容
              </div>
            </div>
          ) : (
            filteredDecks.map((deck: DeckInfo) => (
              <div key={deck.name} style={{
                display: "flex",
                flexDirection: "column",
                borderBottom: "1px solid var(--orca-color-border-1)"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px",
                  backgroundColor: "var(--orca-color-bg-1)"
                }}>
                  {/* 卡组信息 */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: "15px",
                      fontWeight: 500,
                      color: "var(--orca-color-text-1)"
                    }}>
                      <HighlightText text={deck.name} query={searchQuery} />
                    </div>
                    {deck.note && (
                      <div style={{
                        fontSize: "12px",
                        color: "var(--orca-color-text-3)",
                        marginTop: "4px",
                        whiteSpace: "pre-wrap"
                      }}>
                        <HighlightText text={deck.note} query={searchQuery} />
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 使用提示 */}
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
          使用技巧
        </h3>
        <div style={{
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          lineHeight: "1.5"
        }}>
          <p><strong>快捷键：</strong></p>
          <ul style={{ paddingLeft: "20px", marginTop: "4px" }}>
            <li><kbd>Escape</kbd> - 清空搜索内容</li>
          </ul>
          <p style={{ marginTop: "12px" }}><strong>搜索范围：</strong></p>
          <ul style={{ paddingLeft: "20px", marginTop: "4px" }}>
            <li>卡组名称（如："英语"、"数学"）</li>
            <li>备注内容（如："重点"、"TOEFL"、"公式"）</li>
          </ul>
        </div>
      </div>
    </div>
  )
}