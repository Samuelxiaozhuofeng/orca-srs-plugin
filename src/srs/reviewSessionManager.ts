import type { DbId } from "../orca.d.ts"
import type { ReviewSessionDescriptor } from "./reviewSessionDescriptor"
import { buildReviewSessionBlockRepr } from "./reviewSessionDescriptor"

/**
 * 复习会话块管理器（F2-01）
 *
 * 每次「启动复习」创建**新**的 review-session 块，并把
 * `ReviewSessionDescriptor` 写入 `_repr.sessionDescriptor`。
 * 不再复用单一全局 blockId 后覆盖描述（避免 Deck A/B 串 scope）。
 *
 * 同一会话块重复打开：导航到已有 blockId 即可，复用块上冻结的描述；
 * 不视为新会话。
 */

/** 可选：最近一次创建的块（诊断用，不作为 scope 来源） */
let lastCreatedReviewSessionBlockId: DbId | null = null

/**
 * 为给定会话描述创建新的复习会话块，并稳定关联 descriptor。
 */
export async function createReviewSessionBlockWithDescriptor(
  pluginName: string,
  descriptor: ReviewSessionDescriptor
): Promise<DbId> {
  const repr = buildReviewSessionBlockRepr(descriptor)
  const deckLabel =
    descriptor.kind === "normal" && descriptor.scope.kind === "deck"
      ? descriptor.scope.deckName
      : descriptor.kind === "fixed"
        ? `fixed/${descriptor.mode}`
        : descriptor.kind === "custom"
          ? "custom"
          : "all"

  const blockId = (await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [
      {
        t: "t",
        v: `[SRS 复习会话 - ${pluginName} - ${deckLabel} - ${descriptor.sessionId.slice(0, 8)}]`
      }
    ],
    repr
  )) as DbId

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [blockId],
    [
      { name: "srs.isReviewSessionBlock", value: true, type: 4 },
      { name: "srs.pluginName", value: pluginName, type: 2 },
      { name: "srs.sessionId", value: descriptor.sessionId, type: 2 }
    ]
  )

  const block = orca.state.blocks?.[blockId] as
    | { _repr?: Record<string, unknown> }
    | undefined
  if (block) {
    // 确保运行时 _repr 含完整 sessionDescriptor（与 insert 参数一致）
    block._repr = repr
  } else {
    console.warn(
      `[${pluginName}] 创建复习会话块后 state 中尚无块 #${blockId}，_repr 依赖 insert 参数`
    )
  }

  lastCreatedReviewSessionBlockId = blockId
  console.log(
    `[${pluginName}] 创建复习会话块: #${blockId} sessionId=${descriptor.sessionId} kind=${descriptor.kind}`
  )
  return blockId
}

/**
 * @deprecated F2-01：请使用 createReviewSessionBlockWithDescriptor。
 * 保留仅为兼容旧调用；无描述时创建 all 语义块已不安全，改为抛错提示。
 */
export async function getOrCreateReviewSessionBlock(
  _pluginName: string
): Promise<DbId> {
  throw new Error(
    "getOrCreateReviewSessionBlock 已废弃：必须使用 createReviewSessionBlockWithDescriptor 并传入 ReviewSessionDescriptor，禁止无描述复用单例会话块"
  )
}

/**
 * 清理会话块记录（插件卸载等）。
 * 不再删除用户笔记中的会话块内容；仅清除进程内 last-created 指针。
 */
export async function cleanupReviewSessionBlock(
  pluginName: string
): Promise<void> {
  if (lastCreatedReviewSessionBlockId != null) {
    const block = orca.state.blocks?.[lastCreatedReviewSessionBlockId] as
      | { _repr?: { type?: string } }
      | undefined
    if (block && block._repr?.type === "srs.review-session") {
      // 保留 _repr.sessionDescriptor，避免打开中的面板丢失描述；
      // 仅在明确卸载时重置进程指针。
    }
    lastCreatedReviewSessionBlockId = null
  }
  console.log(`[${pluginName}] 已清理复习会话块进程内记录`)
}

/** 测试/诊断：最近创建的会话块 ID */
export function getLastCreatedReviewSessionBlockId(): DbId | null {
  return lastCreatedReviewSessionBlockId
}

/** 测试用：重置进程内指针 */
export function resetReviewSessionBlockManagerForTests(): void {
  lastCreatedReviewSessionBlockId = null
}

export async function resolveReviewSessionBlock(blockId: DbId) {
  const fromState = orca.state.blocks?.[blockId]
  if (fromState) return fromState
  try {
    return await orca.invokeBackend("get-block", blockId)
  } catch (error) {
    console.warn("[srs] 无法从后端获取复习会话块:", error)
    throw error instanceof Error
      ? error
      : new Error(`无法获取复习会话块 #${blockId}: ${String(error)}`)
  }
}
