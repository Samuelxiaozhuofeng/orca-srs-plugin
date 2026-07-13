/**
 * 复习会话描述（F2-01）
 *
 * 版本化、可序列化的会话启动描述。启动入口创建后写入目标
 * review-session 块的 `_repr.sessionDescriptor`；Renderer 只按
 * 当前 blockId 对应的描述加载，禁止依赖「最后一次启动」模块变量。
 *
 * 同一会话块重复打开：复用该块上已写入的 descriptor（同 sessionId），
 * 不新建会话、不覆盖为其他 scope。每次「启动复习」总是新建块 + 新 sessionId。
 */

import type { DbId } from "../orca.d.ts"
import type { ReviewCard } from "./types"
import { cardKeyFromReviewCard } from "./cardIdentity"
import {
  createAllScope,
  createDeckScope,
  createFixedScope,
  type ReviewSessionScope
} from "./reviewSessionScope"

/** 当前 schema 版本；未知版本必须明确失败 */
export const REVIEW_SESSION_DESCRIPTOR_VERSION = 1 as const

export type ReviewSessionDescriptorVersion =
  typeof REVIEW_SESSION_DESCRIPTOR_VERSION

/** 自定义学习模式（F2-11/12 扩展；本任务只建类型，无启动 UI） */
export type CustomStudyMode = "scheduled" | "practice"

/**
 * 自定义学习定义占位（可扩展，不伪造完整筛选能力）。
 * 仅用于序列化/校验互斥类型；不得作为「成功启动自定义学习」路径。
 */
export type CustomStudyDefinitionV1 = {
  readonly version: 1
  readonly mode: CustomStudyMode
}

type DescriptorBase = {
  readonly version: ReviewSessionDescriptorVersion
  /** 稳定会话身份，供后续断点恢复关联 */
  readonly sessionId: string
  /** 创建时间（Unix 毫秒） */
  readonly createdAt: number
  /** 是否推进正式 FSRS / 写正式日志 */
  readonly updatesSrs: boolean
  /** 是否消耗全局每日额度 */
  readonly consumesDailyQuota: boolean
}

/** 普通全部复习 */
export type NormalAllSessionDescriptor = DescriptorBase & {
  readonly kind: "normal"
  readonly scope: { readonly kind: "all" }
  readonly updatesSrs: true
  readonly consumesDailyQuota: true
}

/** 普通单牌组复习 */
export type NormalDeckSessionDescriptor = DescriptorBase & {
  readonly kind: "normal"
  readonly scope: { readonly kind: "deck"; readonly deckName: string }
  readonly updatesSrs: true
  readonly consumesDailyQuota: true
}

export type NormalSessionDescriptor =
  | NormalAllSessionDescriptor
  | NormalDeckSessionDescriptor

/** fixed/repeat：重复复习 / 困难卡 / 查询块专项（不更新 SRS、不消耗额度） */
export type FixedRepeatSessionDescriptor = DescriptorBase & {
  readonly kind: "fixed"
  readonly mode: "repeat"
  readonly source: {
    readonly sourceType: "query" | "children"
    /** 字符串化 DbId，JSON 稳定 */
    readonly sourceBlockId: string
  }
  /** 创建时冻结的精确 cardKey 集合 */
  readonly cardKeys: readonly string[]
  /** List 根卡 id 字符串，允许同根后续条目 */
  readonly fixedRootIds: readonly string[]
  readonly updatesSrs: false
  readonly consumesDailyQuota: false
}

/**
 * custom：可扩展类型。本任务不提供启动/成功加载路径；
 * 若块上出现此类描述，Renderer 必须显示明确错误，不得回退 all。
 */
export type CustomSessionDescriptor = DescriptorBase & {
  readonly kind: "custom"
  readonly definition: CustomStudyDefinitionV1
}

export type ReviewSessionDescriptor =
  | NormalSessionDescriptor
  | FixedRepeatSessionDescriptor
  | CustomSessionDescriptor

/** 写入块 `_repr` 时的包装字段名 */
export const SESSION_DESCRIPTOR_REPR_KEY = "sessionDescriptor" as const

export class ReviewSessionDescriptorError extends Error {
  readonly code:
    | "missing"
    | "invalid_type"
    | "unknown_version"
    | "invalid_fields"
    | "unsupported_kind"

  constructor(
    code: ReviewSessionDescriptorError["code"],
    message: string
  ) {
    super(message)
    this.name = "ReviewSessionDescriptorError"
    this.code = code
  }
}

// ============================================
// sessionId
// ============================================

export function generateReviewSessionId(now: number = Date.now()): string {
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID()
  }
  return `sess_${now}_${Math.random().toString(36).slice(2, 12)}`
}

// ============================================
// Factories（纯函数，可单测）
// ============================================

export function createNormalAllSessionDescriptor(
  options: { sessionId?: string; createdAt?: number } = {}
): NormalAllSessionDescriptor {
  const createdAt = options.createdAt ?? Date.now()
  return Object.freeze({
    version: REVIEW_SESSION_DESCRIPTOR_VERSION,
    sessionId: options.sessionId ?? generateReviewSessionId(createdAt),
    createdAt,
    kind: "normal" as const,
    scope: Object.freeze({ kind: "all" as const }),
    updatesSrs: true as const,
    consumesDailyQuota: true as const
  })
}

export function createNormalDeckSessionDescriptor(
  deckName: string,
  options: { sessionId?: string; createdAt?: number } = {}
): NormalDeckSessionDescriptor {
  const name = String(deckName).trim()
  if (!name) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      "normal/deck 描述需要非空 deckName"
    )
  }
  const createdAt = options.createdAt ?? Date.now()
  return Object.freeze({
    version: REVIEW_SESSION_DESCRIPTOR_VERSION,
    sessionId: options.sessionId ?? generateReviewSessionId(createdAt),
    createdAt,
    kind: "normal" as const,
    scope: Object.freeze({ kind: "deck" as const, deckName: name }),
    updatesSrs: true as const,
    consumesDailyQuota: true as const
  })
}

/**
 * 从可选 deckName 创建 normal 描述：空/undefined → all，否则 deck。
 */
export function createNormalSessionDescriptor(
  deckName?: string | null,
  options: { sessionId?: string; createdAt?: number } = {}
): NormalSessionDescriptor {
  if (deckName == null || String(deckName).trim() === "") {
    return createNormalAllSessionDescriptor(options)
  }
  return createNormalDeckSessionDescriptor(String(deckName), options)
}

export function createFixedRepeatSessionDescriptor(
  params: {
    cards: readonly ReviewCard[]
    sourceBlockId: DbId | string | number
    sourceType: "query" | "children"
    sessionId?: string
    createdAt?: number
  }
): FixedRepeatSessionDescriptor {
  if (params.sourceType !== "query" && params.sourceType !== "children") {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `fixed/repeat sourceType 无效: ${String(params.sourceType)}`
    )
  }
  const fixed = createFixedScope(params.cards)
  const createdAt = params.createdAt ?? Date.now()
  return Object.freeze({
    version: REVIEW_SESSION_DESCRIPTOR_VERSION,
    sessionId: params.sessionId ?? generateReviewSessionId(createdAt),
    createdAt,
    kind: "fixed" as const,
    mode: "repeat" as const,
    source: Object.freeze({
      sourceType: params.sourceType,
      sourceBlockId: String(params.sourceBlockId)
    }),
    cardKeys: fixed.cardKeys,
    fixedRootIds: fixed.fixedRootIds,
    updatesSrs: false as const,
    consumesDailyQuota: false as const
  })
}

/**
 * custom 模式固定的 SRS/额度语义（不可覆盖）：
 * - scheduled → updatesSrs=true, consumesDailyQuota=true
 * - practice  → updatesSrs=false, consumesDailyQuota=false
 */
export function customModeSrsFlags(
  mode: CustomStudyMode
): { updatesSrs: boolean; consumesDailyQuota: boolean } {
  if (mode === "scheduled") {
    return { updatesSrs: true, consumesDailyQuota: true }
  }
  if (mode === "practice") {
    return { updatesSrs: false, consumesDailyQuota: false }
  }
  throw new ReviewSessionDescriptorError(
    "invalid_fields",
    `custom definition.mode 无效: ${String(mode)}`
  )
}

/**
 * 仅供测试与未来 F2-11/12 使用；当前无 UI 启动路径。
 * 不接受 updatesSrs / consumesDailyQuota 覆盖参数。
 */
export function createCustomSessionDescriptor(
  definition: CustomStudyDefinitionV1,
  options: {
    sessionId?: string
    createdAt?: number
  } = {}
): CustomSessionDescriptor {
  if (definition?.version !== 1) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      "custom definition.version 必须为 1"
    )
  }
  if (definition.mode !== "scheduled" && definition.mode !== "practice") {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `custom definition.mode 无效: ${String(definition.mode)}`
    )
  }
  const createdAt = options.createdAt ?? Date.now()
  const mode = definition.mode
  const flags = customModeSrsFlags(mode)
  return Object.freeze({
    version: REVIEW_SESSION_DESCRIPTOR_VERSION,
    sessionId: options.sessionId ?? generateReviewSessionId(createdAt),
    createdAt,
    kind: "custom" as const,
    definition: Object.freeze({
      version: 1 as const,
      mode
    }),
    updatesSrs: flags.updatesSrs,
    consumesDailyQuota: flags.consumesDailyQuota
  })
}

// ============================================
// Scope 派生
// ============================================

/**
 * 从描述得到队列 scope。custom 抛错（本任务不加载自定义队列）。
 */
export function scopeFromReviewSessionDescriptor(
  descriptor: ReviewSessionDescriptor
): ReviewSessionScope {
  switch (descriptor.kind) {
    case "normal":
      if (descriptor.scope.kind === "all") {
        return createAllScope()
      }
      return createDeckScope(descriptor.scope.deckName)
    case "fixed":
      return Object.freeze({
        kind: "fixed" as const,
        cardKeys: Object.freeze([...descriptor.cardKeys]),
        fixedRootIds: Object.freeze([...descriptor.fixedRootIds])
      })
    case "custom":
      throw new ReviewSessionDescriptorError(
        "unsupported_kind",
        "自定义学习会话描述尚不可加载（F2-11/12 未实现），不得回退为全部复习"
      )
    default: {
      const _exhaustive: never = descriptor
      return _exhaustive
    }
  }
}

// ============================================
// 序列化 / 校验
// ============================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `会话描述字段 ${field} 必须为非空字符串`
    )
  }
  return value
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `会话描述字段 ${field} 必须为 boolean`
    )
  }
  return value
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `会话描述字段 ${field} 必须为有限数字`
    )
  }
  return value
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string")) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `会话描述字段 ${field} 必须为 string[]`
    )
  }
  return value.map(String)
}

/**
 * 严格解析未知输入为 ReviewSessionDescriptor。
 * 缺失、损坏、未知版本、未知 kind → 抛 ReviewSessionDescriptorError，不回退 all。
 */
export function parseReviewSessionDescriptor(
  raw: unknown
): ReviewSessionDescriptor {
  if (raw == null) {
    throw new ReviewSessionDescriptorError(
      "missing",
      "会话描述缺失：无法加载复习会话（请重新启动复习，勿回退为全部牌组）"
    )
  }
  if (!isPlainObject(raw)) {
    throw new ReviewSessionDescriptorError(
      "invalid_type",
      "会话描述格式无效：期望对象"
    )
  }

  const version = raw.version
  if (version !== REVIEW_SESSION_DESCRIPTOR_VERSION) {
    throw new ReviewSessionDescriptorError(
      "unknown_version",
      `不支持的会话描述版本: ${String(version)}（当前支持 v${REVIEW_SESSION_DESCRIPTOR_VERSION}）`
    )
  }

  const sessionId = assertString(raw.sessionId, "sessionId")
  const createdAt = assertFiniteNumber(raw.createdAt, "createdAt")
  const kind = raw.kind

  if (kind === "normal") {
    const updatesSrs = assertBoolean(raw.updatesSrs, "updatesSrs")
    const consumesDailyQuota = assertBoolean(
      raw.consumesDailyQuota,
      "consumesDailyQuota"
    )
    if (updatesSrs !== true || consumesDailyQuota !== true) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        "normal 会话必须 updatesSrs=true 且 consumesDailyQuota=true"
      )
    }
    if (!isPlainObject(raw.scope)) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        "normal 会话缺少 scope"
      )
    }
    const scopeKind = raw.scope.kind
    if (scopeKind === "all") {
      return createNormalAllSessionDescriptor({ sessionId, createdAt })
    }
    if (scopeKind === "deck") {
      const deckName = assertString(raw.scope.deckName, "scope.deckName")
      return createNormalDeckSessionDescriptor(deckName, {
        sessionId,
        createdAt
      })
    }
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `normal.scope.kind 无效: ${String(scopeKind)}`
    )
  }

  if (kind === "fixed") {
    const mode = raw.mode
    if (mode !== "repeat") {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        `fixed.mode 无效或不支持: ${String(mode)}（当前仅 repeat）`
      )
    }
    const updatesSrs = assertBoolean(raw.updatesSrs, "updatesSrs")
    const consumesDailyQuota = assertBoolean(
      raw.consumesDailyQuota,
      "consumesDailyQuota"
    )
    if (updatesSrs !== false || consumesDailyQuota !== false) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        "fixed/repeat 必须 updatesSrs=false 且 consumesDailyQuota=false"
      )
    }
    if (!isPlainObject(raw.source)) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        "fixed/repeat 缺少 source"
      )
    }
    const sourceType = raw.source.sourceType
    if (sourceType !== "query" && sourceType !== "children") {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        `fixed/repeat sourceType 无效: ${String(sourceType)}`
      )
    }
    const sourceBlockId = assertString(
      raw.source.sourceBlockId,
      "source.sourceBlockId"
    )
    const cardKeys = assertStringArray(raw.cardKeys, "cardKeys")
    const fixedRootIds = assertStringArray(raw.fixedRootIds, "fixedRootIds")
    return Object.freeze({
      version: REVIEW_SESSION_DESCRIPTOR_VERSION,
      sessionId,
      createdAt,
      kind: "fixed" as const,
      mode: "repeat" as const,
      source: Object.freeze({
        sourceType: sourceType as "query" | "children",
        sourceBlockId
      }),
      cardKeys: Object.freeze(cardKeys),
      fixedRootIds: Object.freeze(fixedRootIds),
      updatesSrs: false as const,
      consumesDailyQuota: false as const
    })
  }

  if (kind === "custom") {
    if (!isPlainObject(raw.definition)) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        "custom 会话缺少 definition"
      )
    }
    const defVersion = raw.definition.version
    if (defVersion !== 1) {
      throw new ReviewSessionDescriptorError(
        "unknown_version",
        `不支持的 custom definition 版本: ${String(defVersion)}`
      )
    }
    const mode = raw.definition.mode
    if (mode !== "scheduled" && mode !== "practice") {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        `custom definition.mode 无效: ${String(mode)}`
      )
    }
    const updatesSrs = assertBoolean(raw.updatesSrs, "updatesSrs")
    const consumesDailyQuota = assertBoolean(
      raw.consumesDailyQuota,
      "consumesDailyQuota"
    )
    const expected = customModeSrsFlags(mode)
    if (
      updatesSrs !== expected.updatesSrs ||
      consumesDailyQuota !== expected.consumesDailyQuota
    ) {
      throw new ReviewSessionDescriptorError(
        "invalid_fields",
        `custom/${mode} 必须 updatesSrs=${expected.updatesSrs} 且 consumesDailyQuota=${expected.consumesDailyQuota}，` +
          `实际 updatesSrs=${updatesSrs} consumesDailyQuota=${consumesDailyQuota}`
      )
    }
    return createCustomSessionDescriptor(
      { version: 1, mode },
      { sessionId, createdAt }
    )
  }

  throw new ReviewSessionDescriptorError(
    "invalid_fields",
    `未知会话 kind: ${String(kind)}（不得回退为 all）`
  )
}

/** JSON 安全快照（深拷贝可序列化字段） */
export function serializeReviewSessionDescriptor(
  descriptor: ReviewSessionDescriptor
): Record<string, unknown> {
  // 经 parse 再返回，保证形状稳定且可逆
  return JSON.parse(JSON.stringify(descriptor)) as Record<string, unknown>
}

/**
 * 从块对象读取并解析 descriptor。
 * 支持 `block._repr.sessionDescriptor` 与 properties 中的 `_repr`。
 */
export function readReviewSessionDescriptorFromBlock(
  block: unknown
): ReviewSessionDescriptor {
  if (block == null || typeof block !== "object") {
    throw new ReviewSessionDescriptorError(
      "missing",
      "会话块不存在，无法读取会话描述"
    )
  }
  const b = block as {
    _repr?: Record<string, unknown>
    properties?: Array<{ name?: string; value?: unknown }>
  }

  let repr: Record<string, unknown> | undefined = b._repr
  if (
    (repr == null || repr.sessionDescriptor == null) &&
    Array.isArray(b.properties)
  ) {
    const prop = b.properties.find((p) => p?.name === "_repr")
    if (prop && isPlainObject(prop.value)) {
      repr = prop.value
    }
  }

  if (repr == null || typeof repr !== "object") {
    throw new ReviewSessionDescriptorError(
      "missing",
      "会话块缺少 _repr，无法读取会话描述"
    )
  }

  if (repr.type != null && repr.type !== "srs.review-session") {
    throw new ReviewSessionDescriptorError(
      "invalid_type",
      `块类型不是 srs.review-session: ${String(repr.type)}`
    )
  }

  return parseReviewSessionDescriptor(repr[SESSION_DESCRIPTOR_REPR_KEY])
}

/**
 * 构建写入块的 `_repr` 对象（含 type + sessionDescriptor）。
 */
export function buildReviewSessionBlockRepr(
  descriptor: ReviewSessionDescriptor
): {
  type: "srs.review-session"
  sessionDescriptor: Record<string, unknown>
} {
  return {
    type: "srs.review-session",
    sessionDescriptor: serializeReviewSessionDescriptor(descriptor)
  }
}

/**
 * 校验 cards 与 fixed descriptor 的 cardKeys 是否一致（至少覆盖描述中的 keys）。
 * 用于启动后自检；不一致时抛错，不静默。
 */
export function assertFixedCardsMatchDescriptor(
  descriptor: FixedRepeatSessionDescriptor,
  cards: readonly ReviewCard[]
): void {
  const present = new Set(cards.map((c) => cardKeyFromReviewCard(c)))
  const missing = descriptor.cardKeys.filter((k) => !present.has(k))
  if (missing.length > 0) {
    throw new ReviewSessionDescriptorError(
      "invalid_fields",
      `fixed/repeat 卡片与描述不一致，缺失 cardKey: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
    )
  }
}
