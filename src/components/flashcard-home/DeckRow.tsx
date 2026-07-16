import type { DeckInfo } from "../../srs/types"
import HighlightText from "./HighlightText"

const { useState } = window.React
const { Button } = orca.components

type DeckRowProps = {
  deck: DeckInfo
  pluginName: string
  searchQuery?: string
  onViewDeck: (deckName: string) => void
  onReviewDeck: (deckName: string) => void
  onNoteChange: (deckName: string, note: string) => void
}

export default function DeckRow({ deck, pluginName, searchQuery = "", onViewDeck, onReviewDeck, onNoteChange }: DeckRowProps) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(deck.note || "")
  const dueCount = deck.overdueCount + deck.todayCount

  const handleClick = () => {
    onViewDeck(deck.name)
  }

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (dueCount > 0 || deck.newCount > 0) {
      onReviewDeck(deck.name)
    }
  }

  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingNote(true)
  }

  const handleNoteSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { setDeckNote } = await import("../../srs/deckNoteManager")
      await setDeckNote(pluginName, deck.name, noteText)
      onNoteChange(deck.name, noteText)
      setIsEditingNote(false)
    } catch (error) {
      console.error(`[${pluginName}] 保存卡组备注失败:`, error)
      orca.notify("error", "保存备注失败", { title: "SRS" })
    }
  }

  const handleNoteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNoteText(deck.note || "")
    setIsEditingNote(false)
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNoteText(e.target.value)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 12px",
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "background-color 0.15s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)"
        }}
      >
        {/* 牌组名称 */}
        <div style={{
          flex: 1,
          fontSize: "14px",
          color: "var(--orca-color-text-1)",
          fontWeight: 500
        }}>
          <div>
            <HighlightText text={deck.name} query={searchQuery} />
          </div>
          {deck.note && !isEditingNote && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                marginTop: "2px",
                cursor: "pointer"
              }}
              onClick={handleNoteClick}
              title="点击编辑备注"
            >
              <HighlightText text={deck.note} query={searchQuery} />
            </div>
          )}
        </div>

        {/* 未学习数 - 蓝色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.newCount > 0 ? "#3b82f6" : "#9ca3af"
        }}>
          {deck.newCount}
        </div>

        {/* 学习中（今天到期） - 红色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.todayCount > 0 ? "#ef4444" : "#9ca3af"
        }}>
          {deck.todayCount}
        </div>

        {/* 待复习（已到期） - 绿色 */}
        <div style={{
          width: "60px",
          textAlign: "center",
          fontSize: "14px",
          color: deck.overdueCount > 0 ? "#22c55e" : "#9ca3af"
        }}>
          {deck.overdueCount}
        </div>

        {/* 操作按钮 */}
        <div style={{ width: "64px", textAlign: "center", display: "flex", gap: "4px" }}>
          <Button
            variant="plain"
            onClick={handleNoteClick}
            style={{
              padding: "4px",
              minWidth: "auto",
              opacity: 0.7
            }}
            title={deck.note ? "编辑备注" : "添加备注"}
          >
            <i className="ti ti-note" />
          </Button>
          <Button
            variant="plain"
            onClick={handleReview}
            style={{
              padding: "4px",
              minWidth: "auto",
              opacity: (dueCount > 0 || deck.newCount > 0) ? 1 : 0.3
            }}
            title="开始复习"
          >
            <i className="ti ti-player-play" />
          </Button>
        </div>
      </div>

      {/* 备注编辑区域 */}
      {isEditingNote && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "6px",
          marginTop: "4px"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={noteText}
              onChange={handleNoteChange}
              placeholder="输入卡组备注..."
              style={{
                flex: 1,
                padding: "4px 8px",
                border: "1px solid var(--orca-color-border-1)",
                borderRadius: "4px",
                backgroundColor: "var(--orca-color-bg-1)",
                color: "var(--orca-color-text-1)",
                fontSize: "13px"
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <Button
              variant="plain"
              onClick={handleNoteCancel}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              取消
            </Button>
            <Button
              variant="solid"
              onClick={handleNoteSave}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
