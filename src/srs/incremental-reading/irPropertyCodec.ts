/**
 * 渐进阅读属性编解码与归一化（无 Orca 副作用，解析失败仅 warn）
 */

import type { Block, CursorNodeData } from "../../orca.d.ts"
import type {
  IRReadingBreakpoint,
  IRReadingBreakpointSelection
} from "./irTypes"

export type {
  IRStage,
  IRLastAction,
  IRReadingBreakpointSelection,
  IRReadingBreakpoint,
  IRState
} from "./irTypes"

export const readProp = (block: Block | undefined, name: string): any =>
  (() => {
    const value = block?.properties?.find(prop => prop.name === name)?.value
    // Orca 的 type=2 等属性在 get-block 时可能返回为单元素数组（如 ["read"]）。
    // 这里统一解包，避免 parseString 读取不到导致 UI 仍显示 init。
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : undefined
    }
    return value
  })()

export const parseNumber = (value: any, fallback: number): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

export const parseOptionalNumber = (value: any): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return null
}

export const parseString = (value: any, fallback: string | null): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  return fallback
}

export const parseDate = (value: any, fallback: Date | null): Date | null => {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

const normalizeCursorNode = (value: any): CursorNodeData | null => {
  if (!value || typeof value !== "object") return null

  const blockId = parseOptionalNumber((value as CursorNodeData).blockId)
  const index = parseNumber((value as CursorNodeData).index, Number.NaN)
  const offset = parseNumber((value as CursorNodeData).offset, Number.NaN)
  const isInline = typeof (value as CursorNodeData).isInline === "boolean"
    ? (value as CursorNodeData).isInline
    : true

  if (blockId === null || !Number.isFinite(index) || !Number.isFinite(offset)) {
    return null
  }

  return {
    blockId,
    isInline,
    index,
    offset
  }
}

const normalizeReadingBreakpointSelection = (value: any): IRReadingBreakpointSelection | null => {
  if (!value || typeof value !== "object") return null

  const rootBlockId = parseOptionalNumber((value as IRReadingBreakpointSelection).rootBlockId)
  const anchor = normalizeCursorNode((value as IRReadingBreakpointSelection).anchor)
  const focus = normalizeCursorNode((value as IRReadingBreakpointSelection).focus)
  const isForward = typeof (value as IRReadingBreakpointSelection).isForward === "boolean"
    ? (value as IRReadingBreakpointSelection).isForward
    : true

  if (rootBlockId === null || !anchor || !focus) {
    return null
  }

  return {
    rootBlockId,
    anchor,
    focus,
    isForward
  }
}

export const normalizeReadingBreakpoint = (
  value: IRReadingBreakpoint | null | undefined
): IRReadingBreakpoint | null => {
  if (!value) return null

  const previewBlockId = parseOptionalNumber(value.previewBlockId)
  const selection = normalizeReadingBreakpointSelection(value.selection)
  const updatedAt = parseDate(value.updatedAt, null)

  if (previewBlockId === null && !selection) {
    return null
  }

  return {
    previewBlockId,
    selection,
    updatedAt
  }
}

export const parseReadingBreakpoint = (value: any): IRReadingBreakpoint | null => {
  const raw = parseString(value, null)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return normalizeReadingBreakpoint({
      previewBlockId: parsed?.previewBlockId ?? null,
      selection: parsed?.selection ?? null,
      updatedAt: parseDate(parsed?.updatedAt, null)
    })
  } catch (error) {
    console.warn("[IR] 解析阅读断点失败:", error)
    return null
  }
}

export const serializeReadingBreakpoint = (
  value: IRReadingBreakpoint | null | undefined
): string | null => {
  const normalized = normalizeReadingBreakpoint(value)
  if (!normalized) return null

  return JSON.stringify({
    previewBlockId: normalized.previewBlockId,
    selection: normalized.selection,
    updatedAt: normalized.updatedAt?.toISOString() ?? null
  })
}

/** 调度身份相关属性（deleteIRSchedulingState 白名单） */
export const IR_SCHEDULING_PROPERTY_NAMES = new Set([
  "ir.priority",
  "ir.lastRead",
  "ir.readCount",
  "ir.due",
  "ir.intervalDays",
  "ir.postponeCount",
  "ir.stage",
  "ir.lastAction",
  "ir.position",
  "ir.resumeBlockId",
  "ir.breakpoint",
  "ir.autoPostponeBatchId"
])

export function getBlockCreatedDate(block: Block): Date | null {
  return parseDate((block as any).created, null)
}

export function getLocalDayStartMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
