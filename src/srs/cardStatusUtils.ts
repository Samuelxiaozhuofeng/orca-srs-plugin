/**
 * 卡片状态管理工具模块
 * 
 * 提供 Bury（埋藏）和 Suspend（暂停）功能：
 * - Bury：将卡片的 due 时间设置为明天零点，不改变其他 SRS 参数
 * - Suspend：使卡片不再出现在复习队列
 *   - 无变体卡（Basic / Choice / Excerpt / List 等）：在 #card 标签中写入 status=suspend
 *   - Cloze / Image Occlusion 变体：在 `srs.c{N}.suspended`（Boolean）标记该变体
 *   - Direction 变体：在 `srs.forward.suspended` / `srs.backward.suspended`（Boolean）标记
 *   - 变体级暂停只影响该变体，同块其它变体不受影响
 */

import type { Block, DbId } from "../orca.d.ts"
import type { CardType, ReviewCard } from "./types"
import { isCardTag } from "./tagUtils"
import { invalidateBlockCache } from "./storage"
import { invalidateIrBlockCache } from "./incremental-reading/irBlockCache"
import { inferCardType } from "./cardIdentity"
import { getAllClozeNumbers } from "./clozeUtils"
import { extractDirectionInfo, getDirectionList } from "./directionUtils"
import { getIoMaskNumbers, readIoMasksFromBlock } from "./imageOcclusion"

/** 变体暂停属性值类型：与 srs.isCard 等既有 Boolean 属性一致（type=4） */
const PROP_TYPE_BOOLEAN = 4

/**
 * 卡片状态类型
 * - normal: 正常状态
 * - suspend: 旧版整块暂停状态（不进正常复习队列；浏览器可显式收集恢复）
 * - pending: 待激活（卡片已建好但尚未排期）
 *
 * pending 与 suspend 的区别很重要：pending 仍由正常收集返回但不进队列；暂停卡
 * 只在 include-suspended 收集路径返回，供 Flash Home 恢复，不计入正常统计。
 */
export type CardStatus = "normal" | "suspend" | "pending"

/**
 * 暂停/恢复操作的卡片定位。
 * 直接接受 ReviewCard 形状，调用方无需手拼变体字段。
 */
export type SuspendTarget = Pick<
  ReviewCard,
  "id" | "cardType" | "clozeNumber" | "directionType" | "listItemId"
>

/** 变体暂停属性名：`srs.c{N}.suspended` / `srs.forward.suspended` / `srs.backward.suspended` */
export function buildVariantSuspendedPropName(
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): string | null {
  if (clozeNumber !== undefined && Number.isInteger(clozeNumber) && clozeNumber >= 1) {
    return `srs.c${clozeNumber}.suspended`
  }
  if (directionType === "forward" || directionType === "backward") {
    return `srs.${directionType}.suspended`
  }
  return null
}

/**
 * 读取块上某个变体的暂停标记（纯属性读取，不依赖后端）。
 *
 * @param cardType - cloze / image-occlusion / direction；其余类型返回 false
 */
export function isVariantSuspended(
  block: Block | undefined,
  cardType: CardType | undefined,
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): boolean {
  if (!block?.properties) return false
  if (cardType !== "cloze" && cardType !== "image-occlusion" && cardType !== "direction") {
    return false
  }
  const propName =
    cardType === "direction"
      ? buildVariantSuspendedPropName(undefined, directionType)
      : buildVariantSuspendedPropName(clozeNumber)
  if (!propName) return false
  const prop = block.properties.find((p) => p.name === propName)
  // 未知值一律视为未暂停：宁可多复习一张，也不要静默吞掉卡片
  return prop?.value === true
}

/**
 * 将暂停目标解析为变体或整块。
 * 与 cardIdentity.inferCardType 同源判定，禁止手拼变体字段。
 */
function resolveSuspendVariant(
  target: SuspendTarget
):
  | { kind: "block" }
  | { kind: "cloze"; clozeNumber: number; cardType: "cloze" | "image-occlusion" }
  | { kind: "direction"; directionType: "forward" | "backward" } {
  const cardType = inferCardType(target)
  if (cardType === "cloze" || cardType === "image-occlusion") {
    if (target.clozeNumber == null) {
      throw new Error(
        `[SRS] 无法定位暂停变体：${cardType} 卡片缺少 clozeNumber（blockId=${target.id}）`
      )
    }
    // 保留结构化 cardType：行内图/子块图宿主不改 _repr，必须靠 cardType
    // 判定 IO 变体（见 模块文档/SRS_图片遮罩.md），不能只看块 repr。
    return { kind: "cloze", clozeNumber: target.clozeNumber, cardType }
  }
  if (cardType === "direction") {
    if (!target.directionType) {
      throw new Error(
        `[SRS] 无法定位暂停变体：direction 卡片缺少 directionType（blockId=${target.id}）`
      )
    }
    return { kind: "direction", directionType: target.directionType }
  }
  return { kind: "block" }
}

/**
 * backend-first 读取块：恢复浏览器中未打开的块必须走后端。
 * 后端 get-block 抛错或返回空都是可见失败（含 blockId），
 * 绝不回退可能陈旧的 orca.state.blocks —— 恢复/迁移路径不允许基于陈旧数据继续。
 */
async function loadBlockBackendFirst(blockId: DbId): Promise<Block> {
  let block: Block | null | undefined
  try {
    block = (await orca.invokeBackend("get-block", blockId)) as Block | null | undefined
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`读取块 #${blockId} 失败（后端 get-block 抛错：${detail}）`, {
      cause: error
    })
  }
  if (!block) {
    throw new Error(`找不到块 #${blockId}（后端 get-block 返回空）`)
  }
  return block
}

function findCardRef(block: Block): Block["refs"][number] | null {
  return (
    block.refs?.find((ref) => ref.type === 2 && isCardTag(ref.alias)) ?? null
  )
}

async function setCardStatus(
  blockId: DbId,
  cardRef: NonNullable<Block["refs"]>[number],
  value: string
): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    cardRef,
    [{ name: "status", value }]
  )
  invalidateBlockCache(blockId)
  invalidateIrBlockCache(blockId)
}

/**
 * 从块的 #card 标签属性中提取卡片状态
 * 
 * 工作原理：
 * 1. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 2. 从引用的 data 数组中找到 name="status" 的属性
 * 3. 返回该属性的 value，如果不存在返回 "normal"
 * 
 * @param block - 块对象
 * @returns 卡片状态，"normal" 或 "suspend"
 */
export function extractCardStatus(block: Block): CardStatus {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "normal"
  }

  // 1. 找到 #card 标签引用
  const cardRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    isCardTag(ref.alias)   // 标签名称为 "card"（大小写不敏感）
  )

  // 边界情况：没有找到 #card 标签引用
  if (!cardRef) {
    return "normal"
  }

  // 边界情况：标签引用没有关联数据
  if (!cardRef.data || cardRef.data.length === 0) {
    return "normal"
  }

  // 2. 从标签关联数据中读取 status 属性
  const statusProperty = cardRef.data.find(d => d.name === "status")

  // 边界情况：没有设置 status 属性
  if (!statusProperty) {
    return "normal"
  }

  // 3. 返回 status 值
  const statusValue = statusProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(statusValue)) {
    if (statusValue.length === 0 || !statusValue[0] || typeof statusValue[0] !== "string") {
      return "normal"
    }
    return normalizeCardStatusValue(statusValue[0])
  } else if (typeof statusValue === "string") {
    return normalizeCardStatusValue(statusValue)
  }

  return "normal"
}

/** 未知值一律按 normal：宁可多复习一张，也不要静默吞掉卡片。 */
function normalizeCardStatusValue(raw: string): CardStatus {
  const value = raw.trim().toLowerCase()
  if (value === "suspend") return "suspend"
  if (value === "pending") return "pending"
  return "normal"
}

/**
 * 暂停卡片（变体感知）
 *
 * - Cloze / Image Occlusion cN：写 `srs.c{N}.suspended=true`，只暂停该变体
 * - Direction forward/backward：写 `srs.<dir>.suspended=true`，只暂停该方向
 * - 其余（Basic / Choice / Excerpt / List 等）：整块 `#card` 写 status=suspend
 *
 * @param target - 卡片定位（可直接传 ReviewCard）
 */
export async function suspendCard(target: SuspendTarget): Promise<void> {
  const blockId = target.id
  const variant = resolveSuspendVariant(target)
  const variantLabel =
    variant.kind === "cloze"
      ? `Cloze c${variant.clozeNumber}`
      : variant.kind === "direction"
        ? `Direction ${variant.directionType}`
        : "卡片"

  console.log(`[SRS] 暂停${variantLabel} #${blockId}`)

  try {
    if (variant.kind === "cloze" || variant.kind === "direction") {
      const propName = buildVariantSuspendedPropName(
        variant.kind === "cloze" ? variant.clozeNumber : undefined,
        variant.kind === "direction" ? variant.directionType : undefined
      )
      if (!propName) {
        throw new Error(`[SRS] 无法构建变体暂停属性（blockId=${blockId}）`)
      }
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [blockId],
        [{ name: propName, value: true, type: PROP_TYPE_BOOLEAN }]
      )
      invalidateBlockCache(blockId)
      invalidateIrBlockCache(blockId)
      console.log(`[SRS] ${variantLabel} #${blockId} 已暂停（变体级）`)
      return
    }

    // 整块路径：写 #card status=suspend
    const block = await loadBlockBackendFirst(blockId)
    const cardRef = findCardRef(block)
    if (!cardRef) {
      throw new Error(`块 #${blockId} 没有 #card 标签`)
    }
    await setCardStatus(blockId, cardRef, "suspend")
    console.log(`[SRS] 卡片 #${blockId} 已暂停`)
  } catch (error) {
    console.error(`[SRS] 暂停${variantLabel}失败:`, error)
    throw error
  }
}

/**
 * 计算块上「目标变体之外的其它存活变体」的暂停属性名。
 * 以调用方传入的 backend 块内容为准（不依赖本地缓存），失败抛错。
 */
function listOtherVariantSuspendedProps(
  block: Block,
  variant:
    | { kind: "cloze"; clozeNumber: number; cardType: "cloze" | "image-occlusion" }
    | { kind: "direction"; directionType: "forward" | "backward" },
  pluginName: string
): string[] {
  const props: string[] = []
  if (variant.kind === "cloze") {
    // IO 判定：以结构化 cardType 为准（行内图/子块图宿主不改 _repr，
    // 收集时仍为 image-occlusion + srs.io.masks）；_repr 检查仅作兜底。
    const reprType = (block as Block & { _repr?: { type?: string } })._repr?.type
    const isIo =
      variant.cardType === "image-occlusion" ||
      reprType === "srs.image-occlusion" ||
      reprType === "image-occlusion"
    if (isIo) {
      let masks
      try {
        masks = readIoMasksFromBlock(block)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(
          `读取图片遮罩失败（blockId=${block.id}），无法确定同块其它变体：${msg}`
        )
      }
      if (!masks) {
        throw new Error(
          `图片遮罩块 #${block.id} 缺少 srs.io.masks，拒绝迁移暂停状态`
        )
      }
      const numbers = getIoMaskNumbers(masks)
      if (!numbers.includes(variant.clozeNumber)) {
        throw new Error(
          `遮罩 c${variant.clozeNumber} 已不存在于块 #${block.id}，请刷新后重试`
        )
      }
      for (const n of numbers) {
        if (n !== variant.clozeNumber) {
          const name = buildVariantSuspendedPropName(n)
          if (name) props.push(name)
        }
      }
      return props
    }
    const numbers = getAllClozeNumbers(block.content, pluginName)
    if (!numbers.includes(variant.clozeNumber)) {
      throw new Error(
        `填空 c${variant.clozeNumber} 已不存在于块 #${block.id}，请刷新后重试`
      )
    }
    for (const n of numbers) {
      if (n !== variant.clozeNumber) {
        const name = buildVariantSuspendedPropName(n)
        if (name) props.push(name)
      }
    }
    return props
  }

  // direction：以 content 中的方向标记为准
  const dirInfo = extractDirectionInfo(block.content, pluginName)
  if (!dirInfo) {
    throw new Error(`块 #${block.id} 的方向卡标记已不存在，请刷新后重试`)
  }
  const directions = getDirectionList(dirInfo.direction)
  if (!directions.includes(variant.directionType)) {
    throw new Error(
      `块 #${block.id} 已不包含 ${variant.directionType} 方向，请刷新后重试`
    )
  }
  for (const dir of directions) {
    if (dir !== variant.directionType) {
      const name = buildVariantSuspendedPropName(undefined, dir)
      if (name) props.push(name)
    }
  }
  return props
}

/**
 * 取消暂停卡片（变体感知，backend-first）
 *
 * - 无变体卡：清除 `#card` 的 status（旧语义）
 * - 变体卡（仅变体级暂停）：删除 `srs.c{N}.suspended` / `srs.<dir>.suspended`
 * - 变体卡 + 整块 `#card.status=suspend`（旧数据整块暂停）：恢复目标变体，
 *   同时把同块其它**当前存活**变体显式写为暂停（suspended=true），再清除整块 status。
 *   这样恢复某一行不会无提示地恢复同块所有其它变体（确定、可测试的迁移语义）。
 *
 * 读取块失败抛错（错误可见，不伪装成功）；每次属性写入后失效块缓存。
 *
 * @param target - 卡片定位（可直接传 ReviewCard）
 * @param options.pluginName - 变体内容解析用的插件名（默认 "srs-plugin"）
 */
export async function unsuspendCard(
  target: SuspendTarget,
  options: { pluginName?: string } = {}
): Promise<void> {
  const blockId = target.id
  const pluginName = options.pluginName ?? "srs-plugin"
  const variant = resolveSuspendVariant(target)
  const variantLabel =
    variant.kind === "cloze"
      ? `Cloze c${variant.clozeNumber}`
      : variant.kind === "direction"
        ? `Direction ${variant.directionType}`
        : "卡片"

  console.log(`[SRS] 取消暂停${variantLabel} #${blockId}`)

  try {
    // 恢复未打开的块必须 backend-first；读取失败抛错
    const block = await loadBlockBackendFirst(blockId)

    if (variant.kind === "block") {
      const cardRef = findCardRef(block)
      if (!cardRef) {
        throw new Error(`块 #${blockId} 没有 #card 标签`)
      }
      await setCardStatus(blockId, cardRef, "")
      console.log(`[SRS] 卡片 #${blockId} 已取消暂停`)
      return
    }

    // 目标变体的暂停属性（可能不存在：legacy 整块暂停）
    const targetPropName = buildVariantSuspendedPropName(
      variant.kind === "cloze" ? variant.clozeNumber : undefined,
      variant.kind === "direction" ? variant.directionType : undefined
    )
    if (!targetPropName) {
      throw new Error(`[SRS] 无法构建变体暂停属性（blockId=${blockId}）`)
    }

    const blockSuspended = extractCardStatus(block) === "suspend"

    if (blockSuspended) {
      // legacy 整块暂停：恢复目标变体，其它存活变体显式保持暂停，再清整块 status
      const otherProps = listOtherVariantSuspendedProps(block, variant, pluginName)
      if (otherProps.length > 0) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setProperties",
          null,
          [blockId],
          otherProps.map((name) => ({ name, value: true, type: PROP_TYPE_BOOLEAN }))
        )
        // 每次 block-property 写入后立即失效（SRS + IR 双域），不能等下一次写
        invalidateBlockCache(blockId)
        invalidateIrBlockCache(blockId)
      }
      const cardRef = findCardRef(block)
      if (!cardRef) {
        throw new Error(`块 #${blockId} 没有 #card 标签`)
      }
      await setCardStatus(blockId, cardRef, "")
    }

    // 删除目标变体的暂停属性（仅当存在时删除，避免对不存在属性发空删除）
    const existingNames =
      block.properties?.filter((p) => p.name === targetPropName).map((p) => p.name) ?? []
    if (existingNames.length > 0) {
      await orca.commands.invokeEditorCommand(
        "core.editor.deleteProperties",
        null,
        [blockId],
        existingNames
      )
      // deleteProperties 同样是 block-property 写：立即失效
      invalidateBlockCache(blockId)
      invalidateIrBlockCache(blockId)
    }

    console.log(`[SRS] ${variantLabel} #${blockId} 已取消暂停`)
  } catch (error) {
    console.error(`[SRS] 取消暂停${variantLabel}失败:`, error)
    throw error
  }
}

/**
 * 计算明天零点的时间
 * @returns 明天零点的 Date 对象
 */
function getTomorrowMidnight(): Date {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}

/**
 * 构建 SRS due 属性名称
 * 
 * @param clozeNumber - 填空编号（可选）
 * @param directionType - 方向类型（可选）
 * @returns 属性名称，如 "srs.due"、"srs.c1.due"、"srs.forward.due"
 */
function buildDuePropertyName(
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): string {
  if (clozeNumber !== undefined) {
    return `srs.c${clozeNumber}.due`
  }
  if (directionType !== undefined) {
    return `srs.${directionType}.due`
  }
  return "srs.due"
}

/**
 * 推迟卡片
 * 
 * 将卡片的 due 时间设置为明天零点，不改变其他 SRS 参数（interval、stability 等）。
 * 卡片今天不会再出现在复习队列中，明天会重新进入正常调度。
 * 
 * @param blockId - 块 ID
 * @param clozeNumber - 填空编号（仅 Cloze 卡片需要）
 * @param directionType - 方向类型（仅 Direction 卡片需要）
 */
export async function postponeCard(
  blockId: DbId,
  clozeNumber?: number,
  directionType?: "forward" | "backward"
): Promise<void> {
  const cardTypeLabel = clozeNumber 
    ? `Cloze c${clozeNumber}` 
    : directionType 
    ? `Direction ${directionType}` 
    : "Basic"
  
  console.log(`[SRS] 推迟 ${cardTypeLabel} 卡片 #${blockId}`)
  
  try {
    const tomorrow = getTomorrowMidnight()
    const propertyName = buildDuePropertyName(clozeNumber, directionType)
    
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: propertyName, type: 5, value: tomorrow }]
    )
    
    // 清除缓存，确保下次 collectReviewCards 读取最新数据
    invalidateBlockCache(blockId)
    
    console.log(`[SRS] 卡片 #${blockId} 已推迟，明天 ${tomorrow.toLocaleDateString()} 再复习`)
  } catch (error) {
    console.error(`[SRS] 推迟卡片失败:`, error)
    throw error
  }
}

// 保持向后兼容性的别名
export const buryCard = postponeCard



/**
 * 批量激活待激活卡片：把 #card 标签的 status 从 pending 清回空。
 *
 * 刻意不复用 `unsuspendCard`：它只读 `orca.state.blocks`，对**未渲染**的块
 * 直接抛「找不到块」——而批量激活面对的正是一堆从未打开过的 AI 卡；
 * 它也没有失效缓存，紧接着的收集会读回旧 status。这里 backend-first 解析并
 * 在写后失效两套缓存。
 *
 * 逐个串行处理并累计失败，不用 Promise.all —— 批量块写入必须有界，
 * 且单张失败不应让整批静默中止。
 */
export async function activatePendingCards(
  blockIds: readonly DbId[]
): Promise<{ activated: DbId[]; failed: Array<{ blockId: DbId; error: string }> }> {
  const activated: DbId[] = []
  const failed: Array<{ blockId: DbId; error: string }> = []

  for (const blockId of blockIds) {
    try {
      let block: Block | null = null
      try {
        block =
          ((await orca.invokeBackend("get-block", blockId)) as Block | null) ??
          null
      } catch {
        block = (orca.state.blocks?.[blockId] as Block | undefined) ?? null
      }
      if (!block) {
        throw new Error(`找不到块 #${blockId}`)
      }

      const cardRef = block.refs?.find(
        (ref) => ref.type === 2 && isCardTag(ref.alias)
      )
      if (!cardRef) {
        throw new Error(`块 #${blockId} 没有 #card 标签`)
      }

      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        cardRef,
        [{ name: "status", value: "" }]
      )

      invalidateBlockCache(blockId)
      invalidateIrBlockCache(blockId)
      activated.push(blockId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[SRS] 激活卡片 #${blockId} 失败:`, error)
      failed.push({ blockId, error: message })
    }
  }

  return { activated, failed }
}
