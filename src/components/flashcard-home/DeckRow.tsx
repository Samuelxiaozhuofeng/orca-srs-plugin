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

/** 计数列类名：非零时取语义色（新卡 / 今日到期 / 积压），为零时降级为中性灰。 */
function countClass(kind: "new" | "today" | "backlog", count: number): string {
  const base = `srs-deck-row__count srs-deck-row__count--${kind}`
  return count > 0 ? `${base} srs-deck-row__count--active` : base
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
    <div className="srs-deck-row">
      <div className="srs-deck-row__main" onClick={handleClick}>
        {/* 牌组名称 */}
        <div className="srs-deck-row__name">
          <div>
            <HighlightText text={deck.name} query={searchQuery} />
          </div>
          {deck.note && !isEditingNote && (
            <div
              className="srs-deck-row__note"
              onClick={handleNoteClick}
              title="点击编辑备注"
            >
              <HighlightText text={deck.note} query={searchQuery} />
            </div>
          )}
        </div>

        {/* 新卡 */}
        <div className={countClass("new", deck.newCount)}>
          {deck.newCount}
        </div>

        {/* 今日到期 */}
        <div className={countClass("today", deck.todayCount)}>
          {deck.todayCount}
        </div>

        {/* 积压（已到期） */}
        <div className={countClass("backlog", deck.overdueCount)}>
          {deck.overdueCount}
        </div>

        {/* 操作按钮 */}
        <div className="srs-deck-row__actions">
          <Button
            variant="plain"
            onClick={handleNoteClick}
            className="srs-deck-row__action"
            title={deck.note ? "编辑备注" : "添加备注"}
          >
            <i className="ti ti-note" />
          </Button>
          <Button
            variant="plain"
            onClick={handleReview}
            className={
              dueCount > 0 || deck.newCount > 0
                ? "srs-deck-row__action srs-deck-row__action--enabled"
                : "srs-deck-row__action srs-deck-row__action--disabled"
            }
            title="开始复习"
          >
            <i className="ti ti-player-play" />
          </Button>
        </div>
      </div>

      {/* 备注编辑区域 */}
      {isEditingNote && (
        <div className="srs-deck-row__note-editor">
          <div className="srs-deck-row__note-editor-row">
            <input
              type="text"
              value={noteText}
              onChange={handleNoteChange}
              placeholder="输入卡组备注..."
              className="srs-deck-row__note-input"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <Button
              variant="plain"
              onClick={handleNoteCancel}
              className="srs-deck-row__note-btn"
            >
              取消
            </Button>
            <Button
              variant="solid"
              onClick={handleNoteSave}
              className="srs-deck-row__note-btn"
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
