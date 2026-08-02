/**
 * 图片遮罩复习渲染器
 * - hideOne：只遮当前编号
 * - hideAll：遮全部，显示答案时揭示当前编号
 */

import type { DbId } from "../../orca.d.ts"
import type { Grade, SrsState } from "../../srs/types"
import { useReviewShortcuts } from "../../hooks/useReviewShortcuts"
import {
  previewIntervals,
  previewDueDates,
  formatDueDate
} from "../../srs/algorithm"
import {
  getIoMaskNumbers,
  readIoMasksFromBlock,
  readStoredIoSrc,
  resolveImageDisplayUrl,
  type IoRectRegion
} from "../../srs/imageOcclusion"
import { getImageOcclusionMode } from "../../srs/settings/reviewSettingsSchema"
import CardInfoPanel from "../review-card/CardInfoPanel"
import { regionStylePercent } from "./ioGeometry"

const { useState, useMemo, useRef, useEffect } = window.React
const { useSnapshot } = window.Valtio
const { Button } = orca.components

type Props = {
  blockId: DbId
  clozeNumber?: number
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  canGoPrevious?: boolean
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  readOnly?: boolean
  readOnlyStatusText?: string
}

function toFullSrs(srsInfo?: Partial<SrsState>): SrsState | null {
  if (!srsInfo) return null
  return {
    stability: srsInfo.stability ?? 0,
    difficulty: srsInfo.difficulty ?? 0,
    interval: srsInfo.interval ?? 0,
    due: srsInfo.due ?? new Date(),
    lastReviewed: srsInfo.lastReviewed ?? null,
    reps: srsInfo.reps ?? 0,
    lapses: srsInfo.lapses ?? 0,
    state: srsInfo.state
  }
}

export default function ImageOcclusionReviewRenderer({
  blockId,
  clozeNumber,
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
  pluginName,
  readOnly = false,
  readOnlyStatusText
}: Props) {
  const [showAnswer, setShowAnswer] = useState(!!readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const prevKeyRef = useRef("")
  const currentKey = `${blockId}-${clozeNumber ?? 0}`

  useEffect(() => {
    if (prevKeyRef.current !== currentKey) {
      setShowAnswer(!!readOnly)
      setShowCardInfo(false)
      prevKeyRef.current = currentKey
    } else if (readOnly) {
      setShowAnswer(true)
    }
  }, [currentKey, readOnly])

  const snapshot = useSnapshot(orca.state)
  const block = useMemo(() => snapshot?.blocks?.[blockId], [snapshot?.blocks, blockId])

  const mode = useMemo(
    () => getImageOcclusionMode(pluginName),
    // plugins settings 变化时重读
    [pluginName, snapshot?.plugins]
  )

  const { regions, src, parseError, numbers } = useMemo(() => {
    if (!block) {
      return {
        regions: [] as IoRectRegion[],
        src: "",
        parseError: null as string | null,
        numbers: [] as number[]
      }
    }
    try {
      const masks = readIoMasksFromBlock(block as any)
      const stored = readStoredIoSrc(block as any) ?? ""
      return {
        regions: masks?.regions ?? [],
        src: stored,
        parseError: null,
        numbers: getIoMaskNumbers(masks)
      }
    } catch (e) {
      return {
        regions: [] as IoRectRegion[],
        src: "",
        parseError: e instanceof Error ? e.message : String(e),
        numbers: [] as number[]
      }
    }
  }, [block])

  const displayUrl = resolveImageDisplayUrl(src)

  const handleGrade = async (grade: Grade) => {
    if (isGrading || readOnly) return
    await onGrade(grade)
    setShowAnswer(false)
  }

  useReviewShortcuts({
    showAnswer,
    isGrading,
    onShowAnswer: () => setShowAnswer(true),
    onGrade: handleGrade,
    onBury: onPostpone,
    onSuspend,
    readOnly
  })

  const fullState = toFullSrs(srsInfo)
  const intervals = useMemo(
    () => previewIntervals(fullState, undefined, pluginName),
    [fullState, pluginName]
  )
  const dueDates = useMemo(
    () => previewDueDates(fullState, undefined, pluginName),
    [fullState, pluginName]
  )

  const n = clozeNumber ?? 0

  const visibleRegions = useMemo(() => {
    if (!n) return []
    if (mode === "hideOne") {
      return regions.filter((r: IoRectRegion) => r.n === n)
    }
    return regions
  }, [regions, n, mode])

  if (!block) {
    return <div className="srs-review-card-placeholder">卡片加载中...</div>
  }

  if (parseError) {
    return (
      <div className="srs-io-review srs-io-review--error">
        遮罩数据损坏：{parseError}
      </div>
    )
  }

  return (
    <div
      className={`srs-io-review srs-review-card ${
        inSidePanel ? "" : "srs-review-card--modal"
      }`}
    >
      {readOnly && (
        <div contentEditable={false} className="srs-review-banner">
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      <div className="srs-review-toolbar">
        <div className="srs-review-toolbar__group">
          {onPrevious && (
            <Button
              variant="plain"
              onClick={canGoPrevious ? onPrevious : undefined}
              title="回到上一张"
              className={`srs-review-icon-btn ${
                canGoPrevious ? "" : "srs-review-icon-btn--disabled"
              }`}
            >
              <i className="ti ti-arrow-left" />
            </Button>
          )}
          <div className="srs-review-type-chip srs-review-type-chip--primary">
            <i className="ti ti-photo" />
            遮罩 c{n || "?"}
          </div>
          <span className="srs-io-review__mode">
            {mode === "hideAll" ? "全部遮罩" : "仅当前"}
            {numbers.length > 1 ? ` · 共 ${numbers.length} 空` : ""}
          </span>
        </div>
        <div className="srs-review-toolbar__group">
          {!readOnly && onPostpone && (
            <Button
              variant="plain"
              onClick={onPostpone}
              title="推迟到明天 (B)"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-calendar-pause" />
            </Button>
          )}
          {!readOnly && onSuspend && (
            <Button
              variant="plain"
              onClick={onSuspend}
              title="暂停卡片 (S)"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-player-pause" />
            </Button>
          )}
          {blockId && onJumpToCard && (
            <Button
              variant="plain"
              onClick={(e: any) => onJumpToCard(blockId, e.shiftKey)}
              title="跳转到卡片"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-external-link" />
            </Button>
          )}
          <Button
            variant="plain"
            onClick={() => setShowCardInfo(!showCardInfo)}
            title="卡片信息"
            className={`srs-review-icon-btn ${
              showCardInfo ? "srs-review-icon-btn--active" : ""
            }`}
          >
            <i className="ti ti-info-circle" />
          </Button>
          {onClose && (
            <Button
              variant="plain"
              onClick={onClose}
              title="关闭"
              className="srs-review-icon-btn"
            >
              <i className="ti ti-x" />
            </Button>
          )}
        </div>
      </div>

      {showCardInfo && <CardInfoPanel srsInfo={srsInfo} />}

      <div className="srs-io-review__scroll">
        {displayUrl ? (
          <div className="srs-io-frame">
            <img
              className="srs-io-frame__img"
              src={displayUrl}
              alt="复习图片"
            />
            {visibleRegions.map((r: IoRectRegion) => {
              const isCurrent = r.n === n
              // 显示答案：当前编号揭开（不画遮罩）；其它编号在 hideAll 下保持实心遮罩
              if (showAnswer && isCurrent) return null
              const className = [
                "srs-io-mask",
                "srs-io-mask--solid",
                isCurrent ? "is-active" : "",
                !isCurrent && mode === "hideAll" ? "is-other" : ""
              ]
                .filter(Boolean)
                .join(" ")
              return (
                <div
                  key={r.id}
                  className={className}
                  style={regionStylePercent(r)}
                >
                  <span className="srs-io-mask__label">c{r.n}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="srs-io-review__missing">无图片源（srs.io.src）</div>
        )}
      </div>

      {readOnly ? (
        <div className="srs-review-actions">
          {onSkip && (
            <Button
              variant="solid"
              onClick={onSkip}
              title="继续复习"
              className="srs-review-cta"
            >
              继续
            </Button>
          )}
        </div>
      ) : !showAnswer ? (
        <div className="srs-review-actions">
          {onSkip && (
            <Button
              variant="outline"
              onClick={onSkip}
              title="跳过当前卡片，不评分"
              className="srs-review-secondary-btn"
            >
              跳过
            </Button>
          )}
          <Button
            variant="solid"
            onClick={() => setShowAnswer(true)}
            className="srs-review-cta"
          >
            显示答案
          </Button>
        </div>
      ) : (
        <div className="srs-card-grade-buttons srs-grade-buttons">
          {onSkip && (
            <button
              onClick={onSkip}
              className="srs-grade-btn srs-grade-btn--skip"
              type="button"
            >
              <div className="srs-grade-btn__preview">不评分</div>
              <span className="srs-grade-btn__emoji">⏭️</span>
              <span className="srs-grade-btn__label">跳过</span>
            </button>
          )}
          {(["again", "hard", "good", "easy"] as Grade[]).map(grade => {
            const labels: Record<Grade, { emoji: string; label: string; cls: string }> = {
              again: { emoji: "😞", label: "忘记", cls: "again" },
              hard: { emoji: "😐", label: "困难", cls: "hard" },
              good: { emoji: "😊", label: "良好", cls: "good" },
              easy: { emoji: "😄", label: "简单", cls: "easy" }
            }
            const meta = labels[grade]
            return (
              <button
                key={grade}
                type="button"
                onClick={() => handleGrade(grade)}
                disabled={isGrading}
                className={`srs-grade-btn srs-grade-btn--${meta.cls}`}
              >
                <div className="srs-grade-btn__preview">
                  {formatDueDate(dueDates[grade])}
                  {intervals ? ` · ${intervals[grade]}` : ""}
                </div>
                <span className="srs-grade-btn__emoji">{meta.emoji}</span>
                <span className="srs-grade-btn__label">{meta.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
