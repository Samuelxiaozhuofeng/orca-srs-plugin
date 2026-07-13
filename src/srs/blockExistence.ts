/**
 * 块存在性三态解析（通用模块）
 *
 * exists  — state 命中，或 get-block 返回可验证的非空块
 * missing — 后端明确返回 null / undefined（才可安全当「不存在」）
 * unknown — 后端 throw / 超时 / 返回不可判定数据（不得当 missing 删除或跳卡）
 *
 * 约定（与 plugin-docs Backend-API get-block 及既有 cleanup 一致）：
 * - 仅 null/undefined 为 missing
 * - throw、timeout、非块/id 不匹配 → unknown，错误不得吞掉
 * - orca.state.blocks 命中为 exists；缺失 state 不代表 missing
 * - 后端晚到结果不得在 timeout 之后写 state/cache 或改变已返回结论
 */

import type { Block, DbId } from "../orca.d.ts"

/** 块读取三态 */
export type BlockExistenceStatus = "exists" | "missing" | "unknown"

/**
 * get-block 默认超时（ms）。保守默认，避免永不 settle 时永久无错误/无重试。
 * 测试可经 options.timeoutMs 注入更短值，避免真等默认时长。
 */
export const DEFAULT_GET_BLOCK_TIMEOUT_MS = 10_000

/** 单次 resolve 结果 */
export type BlockExistenceResult = {
  status: BlockExistenceStatus
  block?: Block
  error?: unknown
  blockId: DbId
}

export type ResolveBlockExistenceOptions = {
  /**
   * 可选运行内缓存。cleanup 应复用同一 cache；
   * 复习 UI 对当前卡可不用 cache，或对 unknown 强制重试时 bypass。
   */
  cache?: BlockExistenceCache
  /**
   * 为 true 时，将后端返回的 exists 块写入 `orca.state.blocks` 供渲染复用。
   * state 命中路径不重复写。默认 false（cleanup 不需要写回）。
   */
  writeToState?: boolean
  /**
   * 为 true 时忽略 cache 中已有条目并重新读后端（重试 unknown 用）。
   * 成功后仍会写回 cache（若提供了 cache）。
   */
  bypassCache?: boolean
  /**
   * get-block 超时毫秒。无效/未提供时用 {@link DEFAULT_GET_BLOCK_TIMEOUT_MS}。
   * 超时归类为 unknown（非 missing）。
   */
  timeoutMs?: number
}

type CachedResolve = {
  status: BlockExistenceStatus
  block?: Block
  error?: unknown
}

type UncachedOptions = {
  writeToState?: boolean
  timeoutMs?: number
}

/**
 * 规范化 timeout：非有限或 ≤0 回退默认；取整。
 */
export function resolveGetBlockTimeoutMs(timeoutMs?: number): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_GET_BLOCK_TIMEOUT_MS
  }
  return Math.floor(timeoutMs)
}

/**
 * 将块写入 orca.state.blocks（复习预加载 / 预缓存路径）。
 * 不吞异常：调用方应保证 orca 可用。
 */
export function writeBlockToOrcaState(block: Block): void {
  const state = orca.state as { blocks?: Record<string | number, Block> }
  if (!state.blocks) {
    state.blocks = {}
  }
  state.blocks[block.id as unknown as number] = block
}

function describeUnknownValue(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

/**
 * 后端非 null 返回值的最小 Block 身份校验。
 * 要求：非数组 object，有限 number `id`，且 `id === 请求 blockId`。
 * 不做完整 Block schema 校验。
 */
export function validateBackendBlockIdentity(
  value: unknown,
  expectedBlockId: DbId
): { ok: true; block: Block } | { ok: false; error: Error } {
  if (value === null || value === undefined) {
    return {
      ok: false,
      error: new Error(
        `[blockExistence] unexpected nullish in identity check (blockId=${expectedBlockId})`
      )
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: new Error(
        `[blockExistence] get-block returned non-block value (blockId=${expectedBlockId}, type=${describeUnknownValue(value)})`
      )
    }
  }
  const rawId = (value as { id?: unknown }).id
  if (typeof rawId !== "number" || !Number.isFinite(rawId)) {
    return {
      ok: false,
      error: new Error(
        `[blockExistence] get-block returned object without finite number id (blockId=${expectedBlockId}, idType=${typeof rawId})`
      )
    }
  }
  // DbId 在运行时为 number
  if (rawId !== (expectedBlockId as unknown as number)) {
    return {
      ok: false,
      error: new Error(
        `[blockExistence] get-block id mismatch (requested=${expectedBlockId}, got=${rawId})`
      )
    }
  }
  return { ok: true, block: value as Block }
}

/**
 * 带超时的 get-block。
 * - 超时：reject 含 blockId 与 timeout 信息的 Error（调用方映射为 unknown）
 * - 清理 timer
 * - 超时后 backend 晚到：忽略，不 resolve/reject 二次，调用方不得据此写 state
 */
function invokeGetBlockWithTimeout(
  blockId: DbId,
  timeoutMs: number
): Promise<unknown> {
  const ms = resolveGetBlockTimeoutMs(timeoutMs)
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false

  const backendPromise = orca.invokeBackend("get-block", blockId) as Promise<unknown>

  return new Promise<unknown>((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new Error(
          `[blockExistence] get-block timeout after ${ms}ms (blockId=${blockId})`
        )
      )
    }, ms)

    backendPromise.then(
      (value: unknown) => {
        if (timer != null) {
          clearTimeout(timer)
          timer = undefined
        }
        if (settled) {
          // timeout 已返回 unknown：晚到结果不得改变结论 / 写 state
          return
        }
        settled = true
        resolve(value)
      },
      (err: unknown) => {
        if (timer != null) {
          clearTimeout(timer)
          timer = undefined
        }
        if (settled) {
          return
        }
        settled = true
        reject(err)
      }
    )
  })
}

/**
 * 单次运行内的块读取缓存，避免对同一 blockId 重复后端调用。
 * unknown 也会被缓存；需要重试时用 bypassCache 或新建 cache。
 */
export class BlockExistenceCache {
  private cache = new Map<DbId, CachedResolve>()

  async resolve(
    blockId: DbId,
    options?: {
      writeToState?: boolean
      bypassCache?: boolean
      timeoutMs?: number
    }
  ): Promise<BlockExistenceResult> {
    if (!options?.bypassCache) {
      const cached = this.cache.get(blockId)
      if (cached) {
        return {
          status: cached.status,
          block: cached.block,
          error: cached.error,
          blockId
        }
      }
    }

    const result = await resolveBlockExistenceUncached(blockId, {
      writeToState: options?.writeToState,
      timeoutMs: options?.timeoutMs
    })
    this.cache.set(blockId, {
      status: result.status,
      block: result.block,
      error: result.error
    })
    return result
  }

  /** 测试用：预置缓存 */
  set(blockId: DbId, result: Omit<BlockExistenceResult, "blockId">): void {
    this.cache.set(blockId, {
      status: result.status,
      block: result.block,
      error: result.error
    })
  }

  /** 测试 / 诊断：读取当前缓存条目（不触发后端） */
  peek(blockId: DbId): CachedResolve | undefined {
    return this.cache.get(blockId)
  }

  clear(): void {
    this.cache.clear()
  }
}

/**
 * 不经 cache 的单次三态解析。
 */
export async function resolveBlockExistenceUncached(
  blockId: DbId,
  options?: UncachedOptions
): Promise<BlockExistenceResult> {
  // orca.state.blocks 仅作命中缓存：有则 exists；缺失不代表 missing
  const fromState = orca.state?.blocks?.[blockId as unknown as number]
  if (fromState) {
    return { status: "exists", block: fromState as Block, blockId }
  }

  try {
    const raw = await invokeGetBlockWithTimeout(
      blockId,
      resolveGetBlockTimeoutMs(options?.timeoutMs)
    )
    // 仅 null/undefined 视为 missing
    if (raw == null) {
      return { status: "missing", blockId }
    }

    const identity = validateBackendBlockIdentity(raw, blockId)
    if (!identity.ok) {
      return { status: "unknown", error: identity.error, blockId }
    }

    if (options?.writeToState) {
      writeBlockToOrcaState(identity.block)
    }
    return { status: "exists", block: identity.block, blockId }
  } catch (error) {
    return { status: "unknown", error, blockId }
  }
}

/**
 * 解析块存在性（三态）。
 * - 提供 cache 时走 cache（cleanup）
 * - 不提供 cache 时每次直接读（复习当前卡重试友好）
 */
export async function resolveBlockExistence(
  blockId: DbId,
  options?: ResolveBlockExistenceOptions | BlockExistenceCache
): Promise<BlockExistenceResult> {
  // 兼容旧签名：resolveBlockExistence(id, cache?)
  if (options instanceof BlockExistenceCache) {
    return options.resolve(blockId)
  }

  const opts = options
  if (opts?.cache) {
    return opts.cache.resolve(blockId, {
      writeToState: opts.writeToState,
      bypassCache: opts.bypassCache,
      timeoutMs: opts.timeoutMs
    })
  }

  return resolveBlockExistenceUncached(blockId, {
    writeToState: opts?.writeToState,
    timeoutMs: opts?.timeoutMs
  })
}

/**
 * 验证卡片块是否存在（兼容导出）。
 *
 * - exists → true
 * - missing → false
 * - unknown → 抛出错误（不得将 unknown 当作 false）
 */
export async function isCardBlockExists(blockId: DbId): Promise<boolean> {
  const result = await resolveBlockExistence(blockId)
  if (result.status === "unknown") {
    const detail =
      result.error instanceof Error
        ? result.error.message
        : String(result.error ?? "unknown error")
    throw new Error(
      `[isCardBlockExists] 无法确认块是否存在 (blockId=${blockId}): ${detail}`
    )
  }
  return result.status === "exists"
}

/**
 * 格式化 unknown / 诊断错误，保留 blockId 与可选 cardKey 及原始异常。
 */
export function formatBlockExistenceError(
  result: Pick<BlockExistenceResult, "blockId" | "error" | "status">,
  context?: { cardKey?: string; role?: string }
): string {
  const detail =
    result.error instanceof Error
      ? result.error.message
      : result.error != null
        ? String(result.error)
        : result.status === "missing"
          ? "block is null/undefined"
          : "unknown"
  const parts = [`blockId=${result.blockId}`, `status=${result.status}`]
  if (context?.cardKey) parts.push(`cardKey=${context.cardKey}`)
  if (context?.role) parts.push(`role=${context.role}`)
  return `${parts.join(" ")}: ${detail}`
}
