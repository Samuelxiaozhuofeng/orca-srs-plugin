/**
 * 渐进阅读自动化模块
 *
 * 功能：监听块变化，自动为Topic的子块标记Extract
 *
 * 设计原则：
 * - 实时响应：用户粘贴子块后立即标记
 * - 零感知：完全自动化，无需手动操作
 * - 无特殊情况：只要父块是Topic，子块就是Extract
 */

import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "./deckUtils"
import { DEFAULT_IR_PRIORITY } from "./incrementalReadingScheduler"
import { loadIRState } from "./incrementalReadingStorage"
import { getIncrementalReadingSettings } from "./settings/incrementalReadingSettingsSchema"
import { buildCardTagData } from "./cardTagDataBuilder"
import { upsertIRIndexId } from "./incremental-reading/irIndex"

/**
 * 判断块是否为渐进阅读 Topic
 *
 * 判断条件：
 * - 必须有 #card 标签
 * - type 属性必须为 "topic"
 */
function isIncrementalReadingTopic(block: Block): boolean {
  const cardType = extractCardType(block)
  return cardType === "topic"
}

// 记录已处理的块，避免重复标记
const processedBlocks = new Set<DbId>()

// Valtio订阅取消函数
let unsubscribe: (() => void) | null = null

// 500ms 防抖定时器（模块级，stop 时必须 clearTimeout，避免 stop 后残留回调触发扫描写入）
let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null

// 世代计数：stop 时自增，使在途异步扫描/标记在下一个检查点中止，保证 stop 后零扫描零写入
let watcherGeneration = 0

/**
 * 检查块是否已标记为Extract
 */
function isAlreadyExtract(block: Block): boolean {
  const cardType = extractCardType(block)
  return cardType === "extracts"
}

/**
 * 获取块的父级 Topic（若存在）
 *
 * NOTE: We rely on `block.parent` which is already used by IR breadcrumb.
 */
function getParentTopic(block: Block): Block | null {
  const parentId = block.parent
  if (!parentId) return null

  const parentBlock = (orca.state.blocks?.[parentId] as Block | undefined)
  if (!parentBlock) return null

  return isIncrementalReadingTopic(parentBlock) ? parentBlock : null
}

/**
 * 自动标记块为Extract
 */
async function autoMarkAsExtract(
  blockId: DbId,
  pluginName: string,
  generation: number
): Promise<void> {
  // stop 后（世代已变）不再处理，保证零写入
  if (generation !== watcherGeneration) {
    return
  }

  const { enableAutoExtractMark } = getIncrementalReadingSettings(pluginName)
  if (!enableAutoExtractMark) {
    return
  }

  // 避免重复处理
  if (processedBlocks.has(blockId)) {
    return
  }

  const block = orca.state.blocks[blockId] as Block
  if (!block) {
    return
  }

  // 检查是否已经是Extract
  if (isAlreadyExtract(block)) {
    upsertIRIndexId(pluginName, blockId, "extracts")
    processedBlocks.add(blockId)
    return
  }

  // 检查父块是否是 Topic（仅标记 Topic 的直接子块）
  const parentTopic = getParentTopic(block)
  if (!parentTopic) {
    return
  }

  // Extract 继承父 Topic 的 ir.priority（单一真相），用于初始排期
  let inheritedPriority = DEFAULT_IR_PRIORITY
  try {
    inheritedPriority = (await loadIRState(parentTopic.id)).priority
  } catch {
    inheritedPriority = DEFAULT_IR_PRIORITY
  }

  // await 之后再次检查：若期间已 stop，则在任何写入开始前中止；
  // 一旦下方写入组开始则整组完成，避免留下打了标签却无 SRS/IR 状态的半成品卡片
  if (generation !== watcherGeneration) {
    return
  }
  console.log(`[${pluginName}] 自动标记 Extract: 块 ${blockId}`)

  try {
    // 添加 #card 标签并设置 type: extracts
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      blockId,
      "card",
      await buildCardTagData(pluginName, blockId, "extracts")
    )

    // 设置 _repr
    const blockWithRepr = orca.state.blocks[blockId] as any
    blockWithRepr._repr = {
      type: "srs.extract-card",
      front: block.text || "",
      back: "(回忆/理解这段内容)",
      cardType: "extracts"
    }

    // 设置属性标记
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )

    // 初始化SRS状态
    const { ensureCardSrsState } = await import("./storage")
    await ensureCardSrsState(blockId)

    // 初始化渐进阅读状态（ir.*）：直接 child 的 sourceTopicId = parent Topic（正确，非凭空臆造）
    // 顺序：写 sourceTopicId → invalidate → updatePriority（与 createExtract 一致）
    const { initializeExtractScheduleAfterCreate } = await import("./extractUtils")
    await initializeExtractScheduleAfterCreate({
      extractBlockId: blockId,
      sourceTopicId: parentTopic.id,
      priority: inheritedPriority
    })
    upsertIRIndexId(pluginName, blockId, "extracts")

    processedBlocks.add(blockId)
    console.log(`[${pluginName}] 自动标记完成: 块 ${blockId}`)
  } catch (error) {
    console.error(`[${pluginName}] 自动标记失败:`, error)
  }
}

/**
 * 扫描所有块，标记 Topic 的直接子块为 Extract
 *
 * Complexity: O(N) over current blocks.
 */
async function scanAndMarkEligibleExtracts(
  pluginName: string,
  generation: number
): Promise<void> {
  const { enableAutoExtractMark } = getIncrementalReadingSettings(pluginName)
  if (!enableAutoExtractMark) {
    return
  }

  const allBlocks = orca.state.blocks as Record<number, Block | undefined>

  for (const block of Object.values(allBlocks)) {
    // stop 后中止在途扫描，保证零扫描零写入
    if (generation !== watcherGeneration) return
    if (!block) continue
    const parentTopic = getParentTopic(block)
    if (!parentTopic) continue
    await autoMarkAsExtract(block.id, pluginName, generation)
  }
}

/**
 * 启动自动标记监听器
 *
 * 使用valtio监听orca.state.blocks的变化
 * 当检测到新块时，检查是否是Topic的子块，如果是则自动标记
 */
export function startAutoMarkExtract(pluginName: string): void {
  // 重入守卫：已启动则直接返回（与 recentDeckManager 同款语义）。
  // 三个调用方（main.ts load、toggle 命令、IR 设置面板）都表达「确保运行中」，
  // 重复 start 视为幂等 no-op，避免覆盖旧订阅句柄造成 valtio 订阅泄漏
  if (unsubscribe) {
    console.log(`[${pluginName}] 渐进阅读自动标记已在运行，跳过重复启动`)
    return
  }

  console.log(`[${pluginName}] 启动渐进阅读自动标记`)

  const generation = watcherGeneration

  // 首次扫描现有的Topic子块
  scanAndMarkEligibleExtracts(pluginName, generation).catch(error => {
    console.error(`[${pluginName}] 初始扫描失败:`, error)
  })

  // 监听blocks变化
  // 使用setTimeout延迟处理，避免频繁触发（定时器为模块级，stop 时统一清除）
  unsubscribe = (window as any).Valtio.subscribe(orca.state.blocks, (ops?: any) => {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId)
    }

    debounceTimeoutId = setTimeout(() => {
      debounceTimeoutId = null
      // stop 后（世代已变）不再扫描
      if (generation !== watcherGeneration) {
        return
      }
      // Prefer op-based incremental handling if Valtio provides `ops`.
      // Fallback to O(N) scan if `ops` is unavailable.
      if (Array.isArray(ops)) {
        const candidateIds: DbId[] = []
        for (const op of ops) {
          if (!op || op.type !== "set") continue
          if (!Array.isArray(op.path) || op.path.length < 1) continue
          const rawId = op.path[0]
          const parsedId = typeof rawId === "number" ? rawId : Number(String(rawId))
          if (!Number.isFinite(parsedId)) continue
          candidateIds.push(parsedId as DbId)
        }

        if (candidateIds.length > 0) {
          Promise.allSettled(candidateIds.map(id => autoMarkAsExtract(id, pluginName, generation)))
            .catch(error => {
              console.error(`[${pluginName}] 自动标记失败:`, error)
            })
          return
        }
      }

      scanAndMarkEligibleExtracts(pluginName, generation).catch(error => {
        console.error(`[${pluginName}] 自动标记失败:`, error)
      })
    }, 500) // 500ms防抖
  })

  console.log(`[${pluginName}] 渐进阅读自动标记已启动`)
}

/**
 * 停止自动标记监听器
 */
export function stopAutoMarkExtract(pluginName: string): void {
  // 世代自增：使在途的防抖回调与异步扫描/标记在下一个检查点中止（停止标志）
  watcherGeneration++

  // 清除残留的防抖定时器，保证 stop 后零扫描零写入
  if (debounceTimeoutId) {
    clearTimeout(debounceTimeoutId)
    debounceTimeoutId = null
  }

  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
    console.log(`[${pluginName}] 渐进阅读自动标记已停止`)
  }

  // 清空已处理记录
  processedBlocks.clear()
}
