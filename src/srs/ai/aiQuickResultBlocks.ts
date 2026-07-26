/**
 * 选中文本 AI 快捷交互：结果块持久化状态机
 * （插入/合并写入串行锁/保留/丢弃/候选挑选，操作 Orca 块）
 *
 * 从 aiQuickInteract.ts 拆出（纯移动，零行为变更）。
 * 外部请继续从 ./aiQuickInteract 导入（稳定入口 re-export）。
 */

import type { Block } from "../../orca.d.ts"

async function resolveBlockById(blockId: number): Promise<Block | null> {
  const fromState = orca.state.blocks[blockId] as Block | undefined
  if (fromState) return fromState
  try {
    const fromBackend = (await orca.invokeBackend("get-block", blockId)) as
      | Block
      | null
      | undefined
    return fromBackend ?? null
  } catch {
    return null
  }
}

/** 相对查询块的插入位置 */
export type QuickResultInsertPosition = "lastChild" | "after"

/** 结果根块初始状态：preview 需用户确认；kept 为直接落盘 */
export type QuickResultCommitStatus = "preview" | "kept"

export type InsertQuickResultOptions = {
  /** 缺省 preview（预览路径）；direct 路径传 kept */
  status?: QuickResultCommitStatus
  /** 写入结果根块的标签（Orca alias，无 #）；空 = 不打标签 */
  tags?: string[]
  /**
   * 同一源块 + 同一提示名时，追加到已有结果根下，不新建多棵树。
   * 合并写入时根标题不含选区，每次结果以选区作条目标题挂在根下。
   */
  reuseSameResultBlock?: boolean
}

export type InsertQuickResultSuccess = {
  success: true
  blockId: number
  /** 是否复用了已有结果根 */
  reused: boolean
}

function getBlockPropertyValue(block: Block, name: string): unknown {
  const props = block.properties as unknown
  if (Array.isArray(props)) {
    const hit = props.find(
      (p) => p && typeof p === "object" && (p as { name?: string }).name === name
    ) as { value?: unknown } | undefined
    return hit?.value
  }
  if (props && typeof props === "object") {
    return (props as Record<string, unknown>)[name]
  }
  return undefined
}

function isQuickResultRootForPrompt(block: Block, promptLabel: string): boolean {
  const isQr = getBlockPropertyValue(block, "srs.ai.quickResult")
  if (isQr !== true && isQr !== "true") return false
  const label = getBlockPropertyValue(block, "srs.ai.promptLabel")
  return typeof label === "string" && label === promptLabel
}

/**
 * 合并写入串行锁：同一源块 + 提示名的 insert 排队，避免连点并发各建一个根。
 * key = `${sourceBlockId}\0${promptLabel}`
 */
const reuseInsertSerialByKey = new Map<string, Promise<unknown>>()

function runSerializedReuseInsert<T>(
  sourceBlockId: number,
  promptLabel: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${sourceBlockId}\0${promptLabel.trim()}`
  const prev = reuseInsertSerialByKey.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  reuseInsertSerialByKey.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

/** 测试用：清空合并写入串行锁 */
export function clearReuseInsertSerialLocksForTests(): void {
  reuseInsertSerialByKey.clear()
}

/**
 * 在源块的子块（lastChild）或同级后方（after）中查找可复用的结果根。
 * 多个匹配时取**最后一个**（最近一次创建）。
 */
export async function findReusableQuickResultRoot(
  sourceBlockId: number,
  promptLabel: string,
  position: QuickResultInsertPosition
): Promise<number | null> {
  const label = promptLabel.trim()
  if (!label) return null

  const source = await resolveBlockById(sourceBlockId)
  if (!source) return null

  let candidateIds: number[] = []
  if (position === "lastChild") {
    candidateIds = (Array.isArray(source.children) ? source.children : []).filter(
      (id): id is number => typeof id === "number" && Number.isFinite(id)
    )
  } else {
    if (source.parent == null) return null
    const parent = await resolveBlockById(source.parent)
    if (!parent) return null
    const siblings = Array.isArray(parent.children) ? parent.children : []
    const idx = siblings.indexOf(sourceBlockId)
    if (idx < 0) return null
    candidateIds = siblings
      .slice(idx + 1)
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
  }

  let found: number | null = null
  for (const id of candidateIds) {
    const block = await resolveBlockById(id)
    if (block && isQuickResultRootForPrompt(block, label)) {
      found = id
    }
  }
  return found
}

async function applyTagsToBlock(
  blockId: number,
  tags: readonly string[]
): Promise<void> {
  if (tags.length === 0) return
  const { invalidateBlockCache } = await import("../storage")

  for (const raw of tags) {
    const alias = raw.trim()
    if (!alias) continue

    const block = await resolveBlockById(blockId)
    if (!block) {
      throw new Error(`打标签失败：找不到块 ${blockId}`)
    }
    const has = (block.refs ?? []).some(
      (ref) =>
        ref.type === 2 &&
        typeof ref.alias === "string" &&
        ref.alias.toLowerCase() === alias.toLowerCase()
    )
    if (has) continue

    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        blockId,
        alias
      )
    } catch (error) {
      console.error("[AI QuickInteract] insertTag 失败:", alias, error)
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`打标签「${alias}」失败: ${detail}`)
    }
    invalidateBlockCache(blockId)
  }
}

type BodyPlan = {
  bodyMarkdown: string
  children: Array<Array<{ t: string; v: unknown; f?: string }>>
}

/** 在 attach 下写入正文（batchInsertText 优先，失败回退 insertBlock） */
async function writeResultBodyUnder(
  attachBlockId: number,
  plan: BodyPlan
): Promise<void> {
  if (!plan.bodyMarkdown) return
  const attach = await resolveBlockById(attachBlockId)
  if (!attach) {
    throw new Error("写入正文失败：找不到挂载块")
  }

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.batchInsertText",
      null,
      attach,
      "lastChild",
      plan.bodyMarkdown,
      false,
      false
    )
    return
  } catch (batchError) {
    console.warn(
      "[AI QuickInteract] batchInsertText 失败，回退逐块插入:",
      batchError
    )
  }

  for (const content of plan.children) {
    const ref = (await resolveBlockById(attachBlockId)) ?? attach
    const fragments =
      content.length > 0 ? content : ([{ t: "t", v: "" }] as const)
    const childId = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      ref,
      "lastChild",
      fragments
    )) as number | null
    if (childId == null || !Number.isFinite(childId)) {
      throw new Error("insertBlock 未返回有效子块 ID")
    }
  }
}

/**
 * 合并写入：在结果根下新增一条「选区标题 + 正文」。
 * 无选区时正文直接挂在根下。
 */
async function appendEntryUnderResultRoot(
  rootId: number,
  plan: BodyPlan,
  selectedText?: string
): Promise<void> {
  const root = await resolveBlockById(rootId)
  if (!root) {
    throw new Error("找不到可复用的结果根块")
  }

  let attachId = rootId
  const sel = selectedText?.trim() ?? ""
  if (sel) {
    const clipped = sel.length > 40 ? `${sel.slice(0, 40)}…` : sel
    const entryId = (await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      root,
      "lastChild",
      [{ t: "t", v: clipped, f: "b" }]
    )) as number | null
    if (entryId == null || !Number.isFinite(entryId)) {
      throw new Error("创建结果条目标题失败")
    }
    attachId = entryId
  }

  await writeResultBodyUnder(attachId, plan)
}

/**
 * 插入形态：
 * - lastChild（插入为子块）:
 *     parent
 *       └── AI · **提示名**
 *             ├── 正文…
 * - after（插入到查询块下方，同级）:
 *     parent（查询块）
 *     AI · **提示名**
 *       └── 正文…
 * - reuseSameResultBlock：同一源块 + 提示名复用结果根；新条目挂在根下
 *
 * 正文优先用 batchInsertText(skipMarkdown=false) 让宿主解析 ** / 列表；
 * 失败则回退为逐条 insertBlock（无手写 "• "，避免与大纲圆点重叠）。
 */
export async function insertQuickResult(
  refBlockId: number,
  resultText: string,
  promptLabel: string,
  position: QuickResultInsertPosition,
  selectedText?: string,
  options?: InsertQuickResultOptions
): Promise<InsertQuickResultSuccess | { success: false; error: string }> {
  const body = resultText.trim()
  if (!body) {
    return { success: false, error: "结果为空，无法插入" }
  }

  const positionLabel = position === "after" ? "块下方" : "子块"
  const status: QuickResultCommitStatus =
    options?.status === "kept" ? "kept" : "preview"
  const tags = Array.isArray(options?.tags)
    ? options!.tags.map((t) => t.trim()).filter(Boolean)
    : []
  const reuse = options?.reuseSameResultBlock === true
  const label = promptLabel.trim() || "快捷交互"

  const doInsert = async (): Promise<
    InsertQuickResultSuccess | { success: false; error: string }
  > => {
    try {
      const refBlock = await resolveBlockById(refBlockId)
      if (!refBlock) {
        return { success: false, error: "找不到目标块，无法插入" }
      }

      const { buildQuickResultInsertPlan } = await import("./aiQuickInteractMd")
      // 合并模式：根标题不含选区；选区作为条目标题
      const plan = buildQuickResultInsertPlan(
        label,
        body,
        reuse ? undefined : selectedText
      )

      let titleId: number | null = null
      let reused = false

      await orca.commands.invokeGroup(
        async () => {
          if (reuse) {
            const existing = await findReusableQuickResultRoot(
              refBlockId,
              label,
              position
            )
            if (existing != null) {
              titleId = existing
              reused = true
              await appendEntryUnderResultRoot(existing, plan, selectedText)
              // 合并后根必须 kept：否则旧 preview job 取消/离场会 delete 整棵含历史条目
              await promoteQuickResultRootToKept(existing)
              await applyTagsToBlock(existing, tags)
              return
            }
          }

          const id = (await orca.commands.invokeEditorCommand(
            "core.editor.insertBlock",
            null,
            refBlock,
            position,
            plan.title
          )) as number | null
          if (id == null || !Number.isFinite(id)) {
            throw new Error("insertBlock 未返回有效标题块 ID")
          }
          titleId = id

          // 写入 AI 内联块标识属性与状态（BlockProperty[]，与 core.editor.setProperties 一致）
          // 失败必须抛出：勿静默 success，否则 direct 路径会误以为已 kept 落盘
          const props: Array<{ name: string; value: unknown; type: number }> = [
            { name: "srs.ai.quickResult", value: true, type: 4 }, // Boolean
            { name: "srs.ai.status", value: status, type: 1 }, // Text: preview | kept
            { name: "srs.ai.promptLabel", value: label, type: 1 }
          ]
          if (!reuse && selectedText) {
            props.push({
              name: "srs.ai.selectedText",
              value: selectedText,
              type: 1
            })
          }
          try {
            await orca.commands.invokeEditorCommand(
              "core.editor.setProperties",
              null,
              [id],
              props
            )
          } catch (propErr) {
            console.error(
              "[AI QuickInteract] 设置 srs.ai.quickResult 属性失败:",
              propErr
            )
            const detail =
              propErr instanceof Error ? propErr.message : String(propErr)
            throw new Error(`设置 AI 结果属性失败: ${detail}`)
          }
          const { invalidateBlockCache } = await import("../storage")
          invalidateBlockCache(id)

          if (reuse) {
            // 新建合并根：选区作第一条目标题，正文挂其下
            await appendEntryUnderResultRoot(id, plan, selectedText)
          } else {
            await writeResultBodyUnder(id, plan)
          }

          await applyTagsToBlock(id, tags)
        },
        { undoable: true, topGroup: true }
      )

      if (titleId == null) {
        return { success: false, error: `创建${positionLabel}失败` }
      }
      return { success: true, blockId: titleId, reused }
    } catch (error) {
      console.error(`[AI QuickInteract] 插入${positionLabel}失败:`, error)
      const message =
        error instanceof Error ? error.message : `插入${positionLabel}失败`
      return { success: false, error: message }
    }
  }

  // 仅合并路径需要串行；普通插入互不影响
  if (reuse) {
    return runSerializedReuseInsert(refBlockId, label, doInsert)
  }
  return doInsert()
}

/**
 * 将结果根标为 kept 并失效缓存。
 * 合并写入复用 preview 根时必须调用，防止旧预览 job dismiss 删树。
 */
async function promoteQuickResultRootToKept(rootId: number): Promise<void> {
  const block = await resolveBlockById(rootId)
  if (!block) return
  const current = getBlockPropertyValue(block, "srs.ai.status")
  if (current === "kept") return

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [rootId],
      [{ name: "srs.ai.status", value: "kept", type: 1 }]
    )
  } catch (error) {
    console.error("[AI QuickInteract] 合并写入后标记 kept 失败:", error)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`合并写入后标记结果为正式内容失败: ${detail}`)
  }
  const { invalidateBlockCache } = await import("../storage")
  invalidateBlockCache(rootId)
}

export async function insertQuickResultAsChild(
  parentBlockId: number,
  resultText: string,
  promptLabel: string,
  selectedText?: string,
  options?: InsertQuickResultOptions
): Promise<InsertQuickResultSuccess | { success: false; error: string }> {
  return insertQuickResult(
    parentBlockId,
    resultText,
    promptLabel,
    "lastChild",
    selectedText,
    options
  )
}

/** 将结果树插入到查询块下方（同级兄弟） */
export async function insertQuickResultAfter(
  sourceBlockId: number,
  resultText: string,
  promptLabel: string,
  selectedText?: string,
  options?: InsertQuickResultOptions
): Promise<InsertQuickResultSuccess | { success: false; error: string }> {
  return insertQuickResult(
    sourceBlockId,
    resultText,
    promptLabel,
    "after",
    selectedText,
    options
  )
}

/**
 * 把已插入在查询块下方的结果树，挪成查询块的 lastChild。
 */
export async function promoteQuickResultToChild(
  sourceBlockId: number,
  resultRootBlockId: number
): Promise<{ success: true } | { success: false; error: string }> {
  if (sourceBlockId === resultRootBlockId) {
    return { success: false, error: "源块与结果块相同，无法移动" }
  }
  try {
    const source = await resolveBlockById(sourceBlockId)
    if (!source) {
      return { success: false, error: "找不到查询块，无法移动" }
    }
    const result = await resolveBlockById(resultRootBlockId)
    if (!result) {
      return { success: false, error: "找不到结果块，可能已被删除" }
    }

    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.moveBlocks",
          null,
          [resultRootBlockId],
          sourceBlockId,
          "lastChild"
        )
      },
      { undoable: true, topGroup: true }
    )
    return { success: true }
  } catch (error) {
    console.error("[AI QuickInteract] 提升为子块失败:", error)
    const message = error instanceof Error ? error.message : "提升为子块失败"
    return { success: false, error: message }
  }
}

/**
 * 关闭/丢弃结果：删除结果标题块（含其子树 ID，避免残留）。
 */
export async function dismissQuickResult(
  resultRootBlockId: number
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const root = await resolveBlockById(resultRootBlockId)
    if (!root) {
      // 已不存在视为成功关闭
      return { success: true }
    }

    const ids = await collectBlockTreeIds(resultRootBlockId)
    if (ids.length === 0) {
      return { success: true }
    }

    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          ids
        )
      },
      { undoable: true, topGroup: true }
    )
    return { success: true }
  } catch (error) {
    console.error("[AI QuickInteract] 关闭结果块失败:", error)
    const message = error instanceof Error ? error.message : "关闭结果块失败"
    return { success: false, error: message }
  }
}

/**
 * 保留预览结果：更新块属性状态为 kept 并失效缓存。
 * 使用 BlockProperty[]（name/value/type），与 core.editor.setProperties 文档一致。
 */
export async function keepQuickResult(
  resultRootBlockId: number
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const root = await resolveBlockById(resultRootBlockId)
    if (!root) {
      return { success: true }
    }

    await orca.commands.invokeGroup(
      async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.setProperties",
          null,
          [resultRootBlockId],
          [{ name: "srs.ai.status", value: "kept", type: 1 }] // Text
        )
      },
      { undoable: true, topGroup: true }
    )
    const { invalidateBlockCache } = await import("../storage")
    invalidateBlockCache(resultRootBlockId)
    return { success: true }
  } catch (error) {
    console.error("[AI QuickInteract] 保留结果块失败:", error)
    const message = error instanceof Error ? error.message : "保留结果块失败"
    return { success: false, error: message }
  }
}

const QUICK_RESULT_TREE_MAX_BLOCKS = 500
const QUICK_RESULT_TREE_MAX_DEPTH = 100

type QuickResultTreeSnapshot = {
  preorder: number[]
  postorder: number[]
  parentById: Map<number, number | null>
  rootParentId: number | null
}

/** 有界读取预览树，供临时选择归一化和最终批量保留共用。 */
async function loadQuickResultTree(
  resultRootBlockId: number
): Promise<QuickResultTreeSnapshot> {
  const preorder: number[] = []
  const postorder: number[] = []
  const parentById = new Map<number, number | null>()
  const visiting = new Set<number>()
  let rootParentId: number | null = null

  const walk = async (
    id: number,
    parentId: number | null,
    depth: number
  ): Promise<void> => {
    if (depth > QUICK_RESULT_TREE_MAX_DEPTH) {
      throw new Error("AI 预览层级过深，无法安全处理")
    }
    if (visiting.has(id) || parentById.has(id)) {
      throw new Error("AI 预览块树存在循环或重复节点")
    }
    if (preorder.length >= QUICK_RESULT_TREE_MAX_BLOCKS) {
      throw new Error("AI 预览块数量过多，无法安全处理")
    }

    const block = await resolveBlockById(id)
    if (!block) {
      throw new Error(
        id === resultRootBlockId
          ? "找不到预览结果根块，可能已被删除"
          : `找不到 AI 预览块 #${id}，可能已被删除`
      )
    }

    if (id === resultRootBlockId) {
      rootParentId =
        typeof block.parent === "number" && Number.isFinite(block.parent)
          ? block.parent
          : null
    }
    visiting.add(id)
    parentById.set(id, parentId)
    preorder.push(id)
    const children = Array.isArray(block.children) ? block.children : []
    for (const childId of children) {
      if (typeof childId === "number" && Number.isFinite(childId)) {
        await walk(childId, id, depth + 1)
      }
    }
    visiting.delete(id)
    postorder.push(id)
  }

  await walk(resultRootBlockId, null, 0)
  return { preorder, postorder, parentById, rootParentId }
}

function hasSelectedAncestor(
  blockId: number,
  selected: ReadonlySet<number>,
  parentById: ReadonlyMap<number, number | null>
): boolean {
  let parentId = parentById.get(blockId)
  let guard = 0
  while (parentId != null && guard++ < QUICK_RESULT_TREE_MAX_DEPTH) {
    if (selected.has(parentId)) return true
    parentId = parentById.get(parentId)
  }
  return false
}

/**
 * 切换一个候选子树的临时选择。
 * 选择父块时自动合并其已选后代；已随祖先选中的块不重复计数。
 * 此函数只读取块树，不写入 Orca。
 */
export async function toggleQuickResultBlockSelection(
  resultRootBlockId: number,
  selectedBlockIds: readonly number[],
  toggleBlockId: number
): Promise<
  | { success: true; selectedBlockIds: number[] }
  | { success: false; error: string }
> {
  if (!Number.isFinite(toggleBlockId) || toggleBlockId === resultRootBlockId) {
    return { success: false, error: "无效的 AI 预览候选块" }
  }

  try {
    const tree = await loadQuickResultTree(resultRootBlockId)
    const treeIds = new Set(tree.preorder)
    if (!treeIds.has(toggleBlockId)) {
      return { success: false, error: "该块不属于当前 AI 预览结果" }
    }

    const selected = new Set(
      selectedBlockIds.filter(
        (id) => id !== resultRootBlockId && treeIds.has(id)
      )
    )

    if (selected.has(toggleBlockId)) {
      selected.delete(toggleBlockId)
    } else if (!hasSelectedAncestor(toggleBlockId, selected, tree.parentById)) {
      const selectedParent = new Set([toggleBlockId])
      for (const id of selected) {
        if (hasSelectedAncestor(id, selectedParent, tree.parentById)) {
          selected.delete(id)
        }
      }
      selected.add(toggleBlockId)
    }

    return {
      success: true,
      selectedBlockIds: tree.preorder.filter((id) => selected.has(id))
    }
  } catch (error) {
    console.error("[AI QuickInteract] 更新候选选择失败:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新候选选择失败"
    }
  }
}

/**
 * 保留用户最终确认的多个候选子树，并删除 AI 外壳与未选内容。
 * 选择阶段不写库；只有调用本函数时才在一个 undo group 中批量移动和清理。
 */
export async function keepSelectedQuickResultBlocks(
  resultRootBlockId: number,
  keepBlockIds: readonly number[]
): Promise<
  | { success: true; keptCount: number }
  | { success: false; error: string }
> {
  if (keepBlockIds.length === 0) {
    return { success: false, error: "请先选择要保留的内容" }
  }

  try {
    const tree = await loadQuickResultTree(resultRootBlockId)
    const treeIds = new Set(tree.preorder)
    const requested = new Set<number>()
    const alreadyMoved = new Set<number>()
    for (const id of keepBlockIds) {
      if (!Number.isFinite(id) || id === resultRootBlockId) {
        return { success: false, error: "所选块不属于当前 AI 预览结果" }
      }
      if (treeIds.has(id)) {
        requested.add(id)
        continue
      }

      // 上次若已 move 但清理外壳失败，允许同一 job 再次确认完成清理。
      const movedBlock = await resolveBlockById(id)
      const movedParentId =
        typeof movedBlock?.parent === "number" &&
        Number.isFinite(movedBlock.parent)
          ? movedBlock.parent
          : null
      if (!movedBlock || movedParentId !== tree.rootParentId) {
        return { success: false, error: "所选块不属于当前 AI 预览结果" }
      }
      alreadyMoved.add(id)
    }

    // 防御性归一化：父子同时出现时只移动父子树根，并保持原文档顺序。
    const orderedRoots = tree.preorder.filter(
      (id) =>
        requested.has(id) &&
        !hasSelectedAncestor(id, requested, tree.parentById)
    )
    if (orderedRoots.length === 0 && alreadyMoved.size === 0) {
      return { success: false, error: "请先选择要保留的内容" }
    }

    const selectedRoots = new Set(orderedRoots)
    const keptTreeIds = new Set(
      tree.preorder.filter(
        (id) =>
          selectedRoots.has(id) ||
          hasSelectedAncestor(id, selectedRoots, tree.parentById)
      )
    )
    const deleteIds = tree.postorder.filter((id) => !keptTreeIds.has(id))

    await orca.commands.invokeGroup(
      async () => {
        if (orderedRoots.length > 0) {
          await orca.commands.invokeEditorCommand(
            "core.editor.moveBlocks",
            null,
            orderedRoots,
            resultRootBlockId,
            "after"
          )
        }
        if (deleteIds.length > 0) {
          await orca.commands.invokeEditorCommand(
            "core.editor.deleteBlocks",
            null,
            deleteIds
          )
        }
      },
      { undoable: true, topGroup: true }
    )
    return {
      success: true,
      keptCount: orderedRoots.length + alreadyMoved.size
    }
  } catch (error) {
    console.error("[AI QuickInteract] 保留所选内容失败:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "保留所选内容失败"
    }
  }
}

/**
 * keepBlockId 是否为 ancestorId 的严格子孙（不含自身）。
 * 沿 parent 链上溯，带环检测与深度上限。
 */
export async function isStrictDescendantOf(
  blockId: number,
  ancestorId: number
): Promise<boolean> {
  if (blockId === ancestorId) return false
  if (!Number.isFinite(blockId) || !Number.isFinite(ancestorId)) return false

  let currentId: number | null | undefined = blockId
  const seen = new Set<number>()
  let guard = 0
  while (
    currentId != null &&
    Number.isFinite(currentId) &&
    guard++ < 200
  ) {
    if (seen.has(currentId)) return false
    seen.add(currentId)
    const block = await resolveBlockById(currentId)
    const parentId = block?.parent
    if (parentId == null || !Number.isFinite(parentId)) return false
    if (parentId === ancestorId) return true
    currentId = parentId
  }
  return false
}

/** 深度优先收集子树 ID（先子后父，便于宿主删除） */
async function collectBlockTreeIds(rootId: number): Promise<number[]> {
  const ordered: number[] = []
  const walk = async (id: number): Promise<void> => {
    const block = await resolveBlockById(id)
    if (!block) return
    const children = Array.isArray(block.children) ? block.children : []
    for (const childId of children) {
      if (typeof childId === "number" && Number.isFinite(childId)) {
        await walk(childId)
      }
    }
    ordered.push(id)
  }
  await walk(rootId)
  return ordered
}
