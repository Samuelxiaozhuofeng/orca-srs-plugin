import type { DbId } from "../../orca.d.ts"
import type { Grade, SrsState } from "../../srs/types"
import { previewDueDates, previewIntervals } from "../../srs/algorithm"
import { useReviewShortcuts } from "../../hooks/useReviewShortcuts"
import {
  loadTtsPlaybackForCard,
  playTtsAudio
} from "../../srs/tts/ttsPlayback"
import SrsErrorBoundary from "../SrsErrorBoundary"
import CardInfoPanel from "./CardInfoPanel"
import {
  EmbeddedAnswerBlock,
  EmbeddedQuestionBlock
} from "./EmbeddedReviewBlocks"
import ReviewGradeButtons from "./ReviewGradeButtons"

const { useEffect, useMemo, useRef, useState, useCallback } = window.React
const { Block, BlockBreadcrumb, Button, ModalOverlay } = orca.components

export type BasicCardReviewRendererProps = {
  front: string
  back: string
  onGrade: (grade: Grade) => Promise<void> | void
  onPostpone?: () => void
  onSuspend?: () => void
  onClose?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  canGoPrevious?: boolean
  srsInfo?: Partial<SrsState>
  isGrading?: boolean
  blockId?: DbId
  nextBlockId?: DbId
  onJumpToCard?: (blockId: DbId, shiftKey?: boolean) => void
  inSidePanel?: boolean
  panelId?: string
  pluginName: string
  cardKey: string
  totalChildCount: number
  isExcerptCard: boolean
  readOnly?: boolean
  readOnlyStatusText?: string
}

function completeState(srsInfo?: Partial<SrsState>): SrsState | null {
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

export default function BasicCardReviewRenderer({
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
  pluginName,
  cardKey,
  totalChildCount,
  isExcerptCard,
  readOnly = false,
  readOnlyStatusText
}: BasicCardReviewRendererProps) {
  const [showAnswer, setShowAnswer] = useState(readOnly)
  const [showCardInfo, setShowCardInfo] = useState(false)
  const [ttsPlayUrl, setTtsPlayUrl] = useState<string | null>(null)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const previousCardKeyRef = useRef("")
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (previousCardKeyRef.current !== cardKey) {
      setShowAnswer(readOnly)
      setShowCardInfo(false)
      setTtsPlayUrl(null)
      setTtsError(null)
      setTtsPlaying(false)
      try {
        audioElRef.current?.pause()
      } catch (error) {
        console.warn("[TTS Review] 切换卡片时暂停音频失败:", error)
      }
      audioElRef.current = null
      previousCardKeyRef.current = cardKey
    } else if (readOnly) {
      setShowAnswer(true)
    }
  }, [cardKey, readOnly])

  // 探测是否有关联 TTS（失败不阻断复习）
  useEffect(() => {
    if (!blockId || !cardKey || isExcerptCard) {
      setTtsPlayUrl(null)
      return
    }
    let cancelled = false
    setTtsLoading(true)
    void loadTtsPlaybackForCard(blockId, cardKey)
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setTtsPlayUrl(result.playUrl)
          setTtsError(null)
        } else {
          setTtsPlayUrl(null)
          if (result.reason === "此卡尚无关联语音") {
            setTtsError(null)
          } else {
            console.error("[TTS Review] 加载播放路径失败:", result.reason)
            setTtsError(result.reason)
          }
        }
      })
      .catch((error) => {
        if (cancelled) return
        console.warn("[TTS Review] 加载播放路径失败:", error)
        setTtsPlayUrl(null)
      })
      .finally(() => {
        if (!cancelled) setTtsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [blockId, cardKey, isExcerptCard])

  useEffect(() => {
    return () => {
      const audio = audioElRef.current
      if (!audio) return
      try {
        audio.pause()
      } catch (error) {
        console.warn("[TTS Review] 离开复习页时暂停音频失败:", error)
      }
      audioElRef.current = null
    }
  }, [])

  const handlePlayTts = useCallback(async () => {
    if (!blockId || !cardKey) return
    setTtsError(null)
    try {
      let url = ttsPlayUrl
      if (!url) {
        const resolved = await loadTtsPlaybackForCard(blockId, cardKey)
        if (!resolved.ok) {
          setTtsError(resolved.reason)
          orca.notify("warn", resolved.reason, { title: "播放语音" })
          return
        }
        url = resolved.playUrl
        setTtsPlayUrl(url)
      }
      setTtsPlaying(true)
      const el = await playTtsAudio({
        playUrl: url,
        audioEl: audioElRef.current ?? undefined
      })
      audioElRef.current = el
      el.onended = () => setTtsPlaying(false)
      el.onerror = () => {
        setTtsPlaying(false)
        const msg = "音频加载或播放失败"
        setTtsError(msg)
        orca.notify("error", msg, { title: "播放语音" })
      }
    } catch (error) {
      setTtsPlaying(false)
      const msg =
        error instanceof Error ? error.message : String(error)
      setTtsError(msg)
      console.error("[TTS Review] 播放失败:", msg)
      orca.notify("error", msg, { title: "播放语音" })
    }
  }, [blockId, cardKey, ttsPlayUrl])

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
    readOnly,
    pluginName
  })

  const fullState = useMemo(() => completeState(srsInfo), [srsInfo])
  const intervals = useMemo(
    () => previewIntervals(fullState, undefined, pluginName),
    [fullState, pluginName]
  )
  const dueDates = useMemo(
    () => previewDueDates(fullState, undefined, pluginName),
    [fullState, pluginName]
  )

  const gradeButtons = (
    <ReviewGradeButtons
      intervals={intervals}
      dueDates={dueDates}
      onGrade={handleGrade}
      onSkip={onSkip}
      readOnly={readOnly}
      pluginName={pluginName}
      isGrading={isGrading}
    />
  )

  const cardContent = (
    <div
      className={`srs-card-container srs-review-card ${
        inSidePanel ? "" : "srs-review-card--modal"
      }`}
    >
      {readOnly && (
        <div contentEditable={false} className="srs-review-banner">
          {readOnlyStatusText ?? "只读回看"}
        </div>
      )}

      {blockId && (
        <div contentEditable={false} className="srs-review-toolbar">
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
          </div>
          <div className="srs-review-toolbar__group">
            {!readOnly && onPostpone && (
              <Button variant="plain" onClick={onPostpone} title="推迟到明天 (B)" className="srs-review-icon-btn">
                <i className="ti ti-calendar-pause" />
              </Button>
            )}
            {!readOnly && onSuspend && (
              <Button variant="plain" onClick={onSuspend} title="暂停卡片 (S)" className="srs-review-icon-btn">
                <i className="ti ti-player-pause" />
              </Button>
            )}
            {onJumpToCard && (
              <Button
                variant="plain"
                onClick={(event: React.MouseEvent) => onJumpToCard(blockId, event.shiftKey)}
                title="跳转到卡片 (Shift+点击在侧面板打开)"
                className="srs-review-icon-btn"
              >
                <i className="ti ti-external-link" />
              </Button>
            )}
            <Button
              variant="plain"
              onClick={() => setShowCardInfo((visible: boolean) => !visible)}
              title="卡片信息"
              className={`srs-review-icon-btn ${
                showCardInfo ? "srs-review-icon-btn--active" : ""
              }`}
            >
              <i className="ti ti-info-circle" />
            </Button>
            {!isExcerptCard && (ttsPlayUrl || ttsLoading) && (
              <Button
                variant="plain"
                onClick={
                  ttsLoading
                    ? undefined
                    : () => {
                        void handlePlayTts()
                      }
                }
                title={ttsPlaying ? "重播语音" : "播放语音"}
                className={`srs-review-icon-btn ${
                  ttsPlaying ? "srs-review-icon-btn--active" : ""
                }${ttsLoading ? " srs-review-icon-btn--disabled" : ""}`}
              >
                <i
                  className={
                    ttsPlaying ? "ti ti-player-play-filled" : "ti ti-volume"
                  }
                />
              </Button>
            )}
          </div>
        </div>
      )}

      {blockId && showCardInfo && <CardInfoPanel srsInfo={srsInfo} />}

      {ttsError && (
        <div
          contentEditable={false}
          className="srs-review-tts-error"
          role="status"
        >
          {ttsError}
        </div>
      )}

      {!isExcerptCard && (
        <div className="srs-card-front srs-review-face srs-review-face--question">
          {/*
            题目始终挂卡根 live Block（EmbeddedQuestionBlock 负责剥离其子块 DOM），
            宿主 inline 渲染（字体样式、页面引用、标签等）在显示答案前后都保留。
            答案区（EmbeddedAnswerBlock）逐个渲染卡根子块 live Block，不挂卡根，
            避免同 panelId+blockId 双实例抢 selection / 破坏编辑会话。
            摘录路径不走此处。
          */}
          <EmbeddedQuestionBlock blockId={blockId} panelId={panelId} fallback={front} />
          {ttsPlayUrl && (
            <div contentEditable={false} className="srs-review-tts-actions">
              <Button
                variant="outline"
                className="srs-review-tts-btn"
                onClick={() => {
                  void handlePlayTts()
                }}
                title={ttsPlaying ? "重播语音" : "播放语音"}
              >
                <i className="ti ti-volume" aria-hidden="true" />{" "}
                {ttsPlaying ? "重播" : "播放语音"}
              </Button>
            </div>
          )}
        </div>
      )}

      {isExcerptCard ? (
        <>
          <div className="srs-card-back srs-review-face">
            {blockId && <BlockBreadcrumb key={blockId} blockId={blockId} />}
            <div contentEditable={false} className="srs-review-face__label">
              摘录
            </div>
            {blockId && panelId ? (
              <Block
                panelId={panelId}
                blockId={blockId}
                blockLevel={0}
                indentLevel={0}
                initiallyCollapsed={false}
              />
            ) : (
              <div className="srs-review-face__text srs-review-face__text--answer srs-review-face__text--selectable">
                {front}
              </div>
            )}
          </div>
          {gradeButtons}
        </>
      ) : totalChildCount === 0 || showAnswer ? (
        <>
          {totalChildCount > 0 && showAnswer && (
            <div className="srs-card-back srs-review-face">
              <div contentEditable={false} className="srs-review-face__label">
                答案
              </div>
              <EmbeddedAnswerBlock blockId={blockId} panelId={panelId} fallback={back} />
            </div>
          )}
          {gradeButtons}
        </>
      ) : (
        <div contentEditable={false} className="srs-review-actions">
          {onSkip && (
            <Button variant="outline" onClick={onSkip} title="跳过当前卡片，不评分" className="srs-review-secondary-btn">
              跳过
            </Button>
          )}
          <Button variant="solid" onClick={() => setShowAnswer(true)} className="srs-review-cta">
            显示答案
          </Button>
        </div>
      )}
    </div>
  )

  const prefetchBlock = nextBlockId && panelId ? (
    <div className="srs-review-prefetch">
      <Block panelId={panelId} blockId={nextBlockId} blockLevel={0} indentLevel={0} />
    </div>
  ) : null

  if (inSidePanel) {
    return (
      <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
        <div className="srs-review-card-host">
          {cardContent}
          {prefetchBlock}
        </div>
      </SrsErrorBoundary>
    )
  }

  return (
    <SrsErrorBoundary componentName="复习卡片" errorTitle="卡片加载出错">
      <ModalOverlay visible={true} canClose={true} onClose={onClose} className="srs-card-modal">
        {cardContent}
        {prefetchBlock}
      </ModalOverlay>
    </SrsErrorBoundary>
  )
}
