/**
 * 「读到文末」探测：跟踪滚动 owner 是否处于末区及进入时刻
 *
 * 判定与文案在 `irEndOfContentGate.ts`（纯逻辑，可测）；本 hook 只负责测量与订阅：
 * - 滚动事件（真实纵向滚动 owner，可能是宿主编辑器祖先，与断点模块同一解析）
 * - 正文/视口尺寸变化（一屏装下全文时不会有滚动事件，必须靠 ResizeObserver 兜底）
 * - 切卡重置，动作触发时再测一次（点击瞬间的真实几何）
 */

import type { DbId } from "../orca.d.ts"
import {
  advanceEndZoneState,
  resolveEndZoneReason,
  type EndZoneState
} from "../srs/incremental-reading/irEndOfContentGate"
import { resolveVerticalScrollOwner } from "./irBreakpointViewport"

const { useCallback, useEffect, useRef } = window.React

/** 切卡后正文渲染/断点恢复需要时间，延迟补测（ms） */
const SETTLE_MEASURE_DELAYS_MS = [400, 1200]

export type UseIRReadingEndZoneOptions = {
  cardId: DbId | null
  containerRef: { current: HTMLElement | null }
  scrollContainerRef?: { current: HTMLElement | null }
  enabled?: boolean
}

export type UseIRReadingEndZoneResult = {
  /** 立即重测并返回最新末区状态（供「下一篇」同步判定） */
  measureNow: () => EndZoneState
  /** 读取当前缓存状态，不触发测量 */
  getState: () => EndZoneState
}

const IDLE_STATE: EndZoneState = { reason: null, enteredAt: null }

export function useIRReadingEndZone(
  options: UseIRReadingEndZoneOptions
): UseIRReadingEndZoneResult {
  const { cardId, containerRef, scrollContainerRef, enabled = true } = options
  const stateRef = useRef<EndZoneState>(IDLE_STATE)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const measureNow = useCallback((): EndZoneState => {
    if (!enabledRef.current || cardId == null) {
      stateRef.current = IDLE_STATE
      return stateRef.current
    }
    const owner = resolveVerticalScrollOwner(
      scrollContainerRef?.current ?? containerRef.current
    )
    if (!owner) {
      stateRef.current = IDLE_STATE
      return stateRef.current
    }
    const reason = resolveEndZoneReason({
      scrollTop: owner.scrollTop,
      clientHeight: owner.clientHeight,
      scrollHeight: owner.scrollHeight
    })
    stateRef.current = advanceEndZoneState(stateRef.current, reason, Date.now())
    return stateRef.current
  }, [cardId, containerRef, scrollContainerRef])

  const getState = useCallback(() => stateRef.current, [])

  // 切卡：清空末区计时（新卡从顶部重新开始）
  useEffect(() => {
    stateRef.current = IDLE_STATE
  }, [cardId])

  useEffect(() => {
    if (!enabled || cardId == null) return
    const owner = resolveVerticalScrollOwner(
      scrollContainerRef?.current ?? containerRef.current
    )
    if (!owner) return

    const onScroll = () => {
      measureNow()
    }
    owner.addEventListener("scroll", onScroll, { passive: true })

    // 一屏装下全文时没有滚动事件；靠尺寸变化 + 延迟补测建立末区状态
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => {
        measureNow()
      })
      observer.observe(owner)
      if (containerRef.current && containerRef.current !== owner) {
        observer.observe(containerRef.current)
      }
    }

    const timers = SETTLE_MEASURE_DELAYS_MS.map(delay =>
      window.setTimeout(() => {
        measureNow()
      }, delay)
    )

    return () => {
      owner.removeEventListener("scroll", onScroll)
      observer?.disconnect()
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [cardId, containerRef, enabled, measureNow, scrollContainerRef])

  return { measureNow, getState }
}

export default useIRReadingEndZone
