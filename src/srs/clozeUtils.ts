/**
 * Cloze 卡片工具模块
 *
 * 提供 Cloze 填空卡片的创建和管理功能
 * 
 * 【2025-12-11 重构】使用直接操作 ContentFragment 数组的方式
 * 替代 deleteSelection + insertFragments，以解决插入位置偏移问题
 */

import type { CursorData, Block, ContentFragment } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import {
  computeLegacyDueFromDaysOffset,
  formatInitialDueHint,
  resolveInitialDue,
  type InitialDueOrigin
} from "./initialDuePolicy"
import { getIrItemInitialDueMode } from "./settings/reviewSettingsSchema"
import {
  ensureClozeSrsState,
  invalidateBlockCache,
  writeInitialClozeSrsState
} from "./storage"
import { isCardTag } from "./tagUtils"
import { ensureCardTagProperties } from "./tagPropertyInit"
import { buildCardTagData } from "./cardTagDataBuilder"

/**
 * 创建 Cloze 时的首次 due 选项。
 * origin 由调用方判定（Topic/Extract/live IR），本函数不猜 IR。
 */
export type CreateClozeOptions = {
  initialDueOrigin?: InitialDueOrigin
  /** ir_item 分散时使用的优先级（0..100，越大越优先） */
  irPriority?: number
}

/**
 * 深拷贝 content 快照，供 undo 在 valtio 变异后仍还原挖空前正文。
 * 优先 structuredClone；失败时 JSON 兜底（ContentFragment 为可序列化结构）。
 */
export function cloneBlockContent(
  content: ContentFragment[] | undefined | null
): ContentFragment[] | undefined {
  if (!content) return undefined
  try {
    return structuredClone(content)
  } catch {
    try {
      return JSON.parse(JSON.stringify(content)) as ContentFragment[]
    } catch (error) {
      console.error("[clozeUtils] cloneBlockContent 失败:", error)
      // 最后兜底：浅拷贝数组 + 浅拷贝各 fragment，至少避免直接引用被原地改写
      return content.map(fragment => ({ ...fragment }))
    }
  }
}

/**
 * 判断一个 fragment 是否为 cloze fragment
 *
 * 首选精确匹配 `${pluginName}.cloze`，同时宽松匹配任何 `xxx.cloze` 后缀，
 * 以兼容历史插件名（如 srs-plugin）创建的旧 fragment。
 *
 * 编号生成（getMaxClozeNumberFromContent）与编号读取（getAllClozeNumbers）
 * 必须共用本判定：若生成侧只认新前缀，块内存在旧前缀 c1 时会重新分配编号 1，
 * 导致两个填空的 cardKey / srs.cN.* 状态混叠。
 *
 * @param fragment - 待判断的 ContentFragment
 * @param pluginName - 插件名称
 */
export function isClozeFragment(
  fragment: ContentFragment,
  pluginName: string
): boolean {
  return (
    fragment.t === `${pluginName}.cloze` ||
    (typeof fragment.t === "string" && fragment.t.endsWith(".cloze"))
  )
}

/**
 * 从 ContentFragment 数组中提取当前最大的 cloze 编号
 *
 * 与 getAllClozeNumbers 共用 isClozeFragment 宽松判定，
 * 保证新编号 = 全部 .cloze fragment 的最大编号 + 1（含旧前缀 fragment）。
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称（用于首选匹配，但也会匹配任何 xxx.cloze 格式）
 * @returns 当前最大的 cloze 编号，如果没有则返回 0
 */
export function getMaxClozeNumberFromContent(
  content: ContentFragment[] | undefined,
  pluginName: string
): number {
  if (!content || content.length === 0) {
    return 0
  }

  let maxNumber = 0
  for (const fragment of content) {
    if (isClozeFragment(fragment, pluginName) && typeof fragment.clozeNumber === "number") {
      if (fragment.clozeNumber > maxNumber) {
        maxNumber = fragment.clozeNumber
      }
    }
  }
  return maxNumber
}

/**
 * 从 ContentFragment 数组中提取所有 cloze 编号
 *
 * @param content - ContentFragment 数组
 * @param pluginName - 插件名称（用于首选匹配，但也会匹配任何 xxx.cloze 格式）
 * @returns cloze 编号数组（去重并排序）
 */
export function getAllClozeNumbers(content: ContentFragment[] | undefined, pluginName: string): number[] {
  if (!content || content.length === 0) {
    return []
  }

  const clozeNumbers = new Set<number>()

  for (const fragment of content) {
    if (isClozeFragment(fragment, pluginName) && typeof fragment.clozeNumber === "number") {
      clozeNumbers.add(fragment.clozeNumber)
    }
  }

  // 转为数组并排序
  return Array.from(clozeNumbers).sort((a, b) => a - b)
}

/**
 * 将指定 clozeNumber 的全部 fragment 解包为普通文本 fragment（保留 `v`）。
 *
 * - 同号多 fragment 全部处理（同号分组），不得只解包第一个
 * - 不合并相邻纯文本：与 `createCloze` / `buildNewContent` 一致，宿主自行处理 content 数组
 * - 仅替换类型与元数据；挖空前的加粗/链接等未保存在 cloze fragment 中，无法恢复
 *
 * @returns unwrappedCount=0 表示内容中无该编号（幂等调用方仍可清属性）
 */
export function unwrapClozeNumberInContent(
  content: ContentFragment[] | undefined,
  clozeNumber: number,
  pluginName: string
): { content: ContentFragment[]; unwrappedCount: number } {
  if (!content || content.length === 0) {
    return { content: content ? [...content] : [], unwrappedCount: 0 }
  }

  let unwrappedCount = 0
  const next: ContentFragment[] = []

  for (const fragment of content) {
    if (
      isClozeFragment(fragment, pluginName) &&
      fragment.clozeNumber === clozeNumber
    ) {
      const text =
        typeof fragment.v === "string" ? fragment.v : String(fragment.v ?? "")
      next.push({ t: "t", v: text })
      unwrappedCount++
    } else {
      next.push(fragment)
    }
  }

  return { content: next, unwrappedCount }
}

/**
 * 将块内指定编号的全部 cloze fragment 解包并写回宿主。
 * 写入成功后立即 `invalidateBlockCache`。
 *
 * @param content - 可选：调用方已从 backend 读到的 content；缺省时从 `orca.state.blocks` 读取
 * @throws 块不存在、或 setBlocksContent 失败时抛错（错误可见，不静默成功）
 */
export async function unwrapClozeFragmentsByNumber(
  blockId: number,
  clozeNumber: number,
  pluginName: string,
  content?: ContentFragment[]
): Promise<{ unwrappedCount: number; content: ContentFragment[] }> {
  let source = content
  if (!source) {
    const block = orca.state.blocks?.[blockId] as Block | undefined
    if (!block) {
      throw new Error(
        `解包填空 c${clozeNumber} 失败：块 #${blockId} 不存在于 state`
      )
    }
    source = block.content ?? []
  }

  const { content: newContent, unwrappedCount } = unwrapClozeNumberInContent(
    source,
    clozeNumber,
    pluginName
  )

  if (unwrappedCount === 0) {
    return { unwrappedCount: 0, content: newContent }
  }

  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      null,
      [{ id: blockId, content: newContent }],
      false
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(
      `解包填空 c${clozeNumber} 的块内容失败（块 #${blockId}）：${msg}。SRS 属性尚未删除，可重试。`
    )
  }

  invalidateBlockCache(blockId)
  return { unwrappedCount, content: newContent }
}

/**
 * 在 ContentFragment 数组中找到指定位置并拆分/插入 cloze fragment
 * 
 * 根据 cursor 的 index 和 offset，找到对应的 fragment，将其拆分，
 * 并在中间插入 cloze fragment
 * 
 * @param content - 原始 ContentFragment 数组
 * @param cursor - 光标数据
 * @param selectedText - 选中的文本
 * @param clozeNumber - cloze 编号
 * @param pluginName - 插件名称
 * @returns 新的 ContentFragment 数组
 */
function buildNewContent(
  content: ContentFragment[],
  cursor: CursorData,
  selectedText: string,
  clozeNumber: number,
  pluginName: string
): ContentFragment[] {
  // 获取选区的起始和结束位置
  const startIndex = Math.min(cursor.anchor.index, cursor.focus.index)
  
  // 根据方向确定起始和结束 offset
  let startOffset: number
  let endOffset: number
  
  if (cursor.anchor.index === cursor.focus.index) {
    // 在同一个 fragment 中
    startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
    endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  } else {
    // 跨越多个 fragment（目前不支持，返回原数组）
    console.warn(`[${pluginName}] 不支持跨 fragment 的选区`)
    return content
  }

  const newContent: ContentFragment[] = []

  for (let i = 0; i < content.length; i++) {
    const fragment = content[i]
    
    if (i === startIndex) {
      // 这是包含选区的 fragment
      const text = fragment.v || ""
      
      // 前半部分（选区之前的文本）
      if (startOffset > 0) {
        const beforeText = text.substring(0, startOffset)
        newContent.push({
          ...fragment,
          v: beforeText
        })
      }
      
      // 插入 cloze fragment
      newContent.push({
        t: `${pluginName}.cloze`,
        v: selectedText,
        clozeNumber: clozeNumber
      } as ContentFragment)
      
      // 后半部分（选区之后的文本）
      if (endOffset < text.length) {
        const afterText = text.substring(endOffset)
        newContent.push({
          ...fragment,
          v: afterText
        })
      }
    } else {
      // 其他 fragment 保持不变
      newContent.push(fragment)
    }
  }

  return newContent
}

/**
 * 将选中的文本转换为 cloze 格式
 * 
 * 【2025-12-11 重构】直接操作 ContentFragment 数组：
 * 1. 根据 cursor.anchor.index/offset 定位到 fragment
 * 2. 拆分该 fragment 并在中间插入 cloze fragment
 * 3. 使用 setBlocksContent 更新块内容
 * 
 * 这种方式能精确控制插入位置，避免 insertFragments 的偏移问题
 * 
 * @param cursor - 当前光标位置和选中信息
 * @param pluginName - 插件名称
 * @param options - 可选首次 due 来源（IR Item 路径由调用方传入）
 * @returns 转换结果或 null
 */
export async function createCloze(
  cursor: CursorData,
  pluginName: string,
  options?: CreateClozeOptions
): Promise<{
  blockId: number
  clozeNumber: number
  /** 以下字段供对称撤销；旧调用方/ mock 可不填 */
  pluginName?: string
  addedCardTag?: boolean
  wroteInitialClozeSrs?: true
  isFirstClozeCard?: boolean
  /** 改写正文前的 content 深拷贝；undo 必须还原，否则残留 .cloze fragment */
  originalContent?: ContentFragment[]
  /** 本次新建填空的首次 due（供 toast / 诊断） */
  initialDue?: Date
  initialDueHint?: string
} | null> {
  // 验证光标数据
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取光标位置")
    console.error(`[${pluginName}] 错误：无法获取光标位置`)
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as Block

  if (!block) {
    orca.notify("error", "未找到当前块")
    console.error(`[${pluginName}] 错误：未找到块 #${blockId}`)
    return null
  }

  // 创建前读取标签状态，供对称撤销判断（不得在改 content 后才推断）
  const hasCardTagBefore =
    block.refs?.some(ref => ref.type === 2 && isCardTag(ref.alias)) ?? false

  // 检查是否在同一块内选择
  if (cursor.anchor.blockId !== cursor.focus.blockId) {
    orca.notify("warn", "请在同一块内选择文本")
    return null
  }

  // 检查是否有选中内容
  if (cursor.anchor.offset === cursor.focus.offset && cursor.anchor.index === cursor.focus.index) {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }

  // 检查是否在同一个 fragment 内（目前只支持单 fragment 选区）
  if (cursor.anchor.index !== cursor.focus.index) {
    orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）")
    return null
  }

  // 确保有 content 数组
  if (!block.content || block.content.length === 0) {
    orca.notify("warn", "块内容为空")
    return null
  }

  // 获取选区对应的 fragment
  const fragmentIndex = cursor.anchor.index
  const fragment = block.content[fragmentIndex]
  
  if (!fragment || !fragment.v) {
    orca.notify("warn", "无法获取选中的文本片段")
    return null
  }

  // 计算选区在 fragment 内的位置
  const startOffset = Math.min(cursor.anchor.offset, cursor.focus.offset)
  const endOffset = Math.max(cursor.anchor.offset, cursor.focus.offset)
  const selectedText = fragment.v.substring(startOffset, endOffset)
  
  if (!selectedText || selectedText.trim() === "") {
    orca.notify("warn", "请先选择要填空的文本")
    return null
  }
  
  // 从 block.content 中获取当前最大的 cloze 编号
  const maxClozeNumber = getMaxClozeNumberFromContent(block.content, pluginName)
  const nextClozeNumber = maxClozeNumber + 1

  // 改写正文前深拷贝：编辑器原生命令栈不会在插件 undo 里还原 fragment
  const originalContent = cloneBlockContent(block.content)

  try {
    // 构建新的 content 数组
    const newContent = buildNewContent(
      block.content,
      cursor,
      selectedText,
      nextClozeNumber,
      pluginName
    )

    // 使用 setBlocksContent 更新块内容
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      cursor,
      [
        {
          id: blockId,
          content: newContent
        }
      ],
      false
    )

    // 处理 #card 标签
    const currentBlock = orca.state.blocks[blockId] as Block
    const hasCardTagAfter = currentBlock.refs?.some(
      ref => ref.type === 2 && isCardTag(ref.alias)
    )

    if (!hasCardTagAfter) {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        blockId,
        "card",
        await buildCardTagData(pluginName, blockId, "cloze")
      )
      console.log(`[${pluginName}] 已添加 #card 标签并设置 type=cloze`)

      // 确保 #card 标签块有属性定义（首次使用时自动初始化）
      await ensureCardTagProperties(pluginName)
    } else {
      const cardRef = currentBlock.refs?.find(
        ref => ref.type === 2 && isCardTag(ref.alias)
      )
      if (!cardRef) {
        throw new Error("已有 #card 标签但无法读取其引用数据")
      }
      await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        cardRef,
        [{ name: "type", value: "cloze" }]
      )
      console.log(`[${pluginName}] 已更新 #card 标签的 type=cloze`)
    }

    // 自动加入复习队列
    const finalBlock = orca.state.blocks[blockId] as BlockWithRepr

    // 设置 _repr
    finalBlock._repr = {
      type: "srs.cloze-card",
      front: block.text || "",
      back: "（填空卡）",
      cardType: "cloze"
    }

    // 获取块中所有的 cloze 编号
    const clozeNumbers = getAllClozeNumbers(finalBlock.content, pluginName)

    // 设置 srs.isCard 属性
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [blockId],
      [{ name: "srs.isCard", value: true, type: 4 }]
    )

    // 属性写入后使块缓存失效，确保下方 ensureClozeSrsState 读取到最新属性
    invalidateBlockCache(blockId)

    // 为每个填空设置初始 SRS 状态：
    // - 仅本次新建的编号无条件写入初始状态（避免复用已删除编号时继承孤儿 srs.cN.* 旧状态）
    // - 已存在的编号只在缺少 srs.cN.* 属性时初始化，绝不覆盖已有复习进度
    // - standard：legacy daysOffset = clozeNumber - 1
    // - ir_item：按 initialDuePolicy 写绝对 due（默认分散 1..14 天），不叠加 clozeNumber-1
    const createdAt = new Date()
    const origin: InitialDueOrigin = options?.initialDueOrigin ?? "standard"
    let newInitialDue: Date | undefined
    let newInitialDueHint: string | undefined

    for (let i = 0; i < clozeNumbers.length; i++) {
      const clozeNumber = clozeNumbers[i]
      const daysOffset = clozeNumber - 1
      const legacyDue = computeLegacyDueFromDaysOffset(createdAt, daysOffset)

      if (clozeNumber === nextClozeNumber) {
        const resolved = resolveInitialDue({
          origin,
          mode: getIrItemInitialDueMode(pluginName),
          identity: {
            blockId,
            cardType: "cloze",
            clozeNumber
          },
          createdAt,
          legacyDue,
          priority: options?.irPriority
        })
        newInitialDue = resolved.due
        newInitialDueHint = formatInitialDueHint(resolved, createdAt)
        await writeInitialClozeSrsState(
          blockId,
          clozeNumber,
          daysOffset,
          origin === "ir_item" ? resolved.due : undefined
        )
      } else {
        // 已有编号：ensure 仅补缺，仍用 legacy 偏移；有状态则完全不动
        await ensureClozeSrsState(blockId, clozeNumber, daysOffset)
      }
    }

    // 显示成功通知
    const dueSuffix =
      origin === "ir_item" && newInitialDueHint
        ? `（${newInitialDueHint}）`
        : ""
    orca.notify(
      "success",
      `已创建填空 c${nextClozeNumber}: "${selectedText}"${dueSuffix}`,
      { title: "Cloze" }
    )

    // 撤销只能回滚本次新增：首次成为 cloze 才摘 #card / 顶层 srs；正文靠 originalContent
    return {
      blockId,
      clozeNumber: nextClozeNumber,
      pluginName,
      addedCardTag: !hasCardTagBefore,
      wroteInitialClozeSrs: true,
      isFirstClozeCard: !hasCardTagBefore,
      originalContent,
      initialDue: newInitialDue,
      initialDueHint: newInitialDueHint
    }
  } catch (error) {
    console.error(`[${pluginName}] 创建 cloze 失败:`, error)
    orca.notify("error", `创建 cloze 失败: ${error}`, { title: "Cloze" })
    return null
  }
}
