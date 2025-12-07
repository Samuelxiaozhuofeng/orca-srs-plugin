import { setupL10N, t } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import SrsReviewSessionDemo from "./components/SrsReviewSessionDemo"
import SrsCardBlockRenderer from "./components/SrsCardBlockRenderer"
import SrsCardBrowser from "./components/SrsCardBrowser"
import type { BlockForConversion, Repr, CursorData, DbId, Block } from "./orca.d.ts"
import { loadCardSrsState, writeInitialSrsState } from "./srs/storage"
import type { ReviewCard } from "./srs/types"

// 扩展 Block 类型以包含 _repr 属性（运行时存在但类型定义中缺失）
type BlockWithRepr = Block & { _repr?: Repr }

let pluginName: string

// 用于存储当前显示的复习会话组件的容器和 root
let reviewSessionContainer: HTMLDivElement | null = null
let reviewSessionRoot: any = null

// 用于存储当前显示的卡片浏览器组件的容器和 root
let cardBrowserContainer: HTMLDivElement | null = null
let cardBrowserRoot: any = null

/**
 * 插件加载函数
 * 在插件启用时被 Orca 调用
 */
export async function load(_name: string) {
  pluginName = _name

  // 设置国际化
  setupL10N(orca.state.locale, { "zh-CN": zhCN })

  console.log(`[${pluginName}] 插件已加载`)

  // ========================================
  // 1. 注册命令
  // ========================================

  // 命令：开始 SRS 复习会话
  orca.commands.registerCommand(
    `${pluginName}.startReviewSession`,
    async () => {
      console.log(`[${pluginName}] 开始 SRS 复习会话`)
      await startReviewSession()
    },
    "SRS: 开始复习"
  )

  // 命令：扫描带标签的块并转换为卡片
  orca.commands.registerCommand(
    `${pluginName}.scanCardsFromTags`,
    () => {
      console.log(`[${pluginName}] 执行标签扫描`)
      scanCardsFromTags()
    },
    "SRS: 扫描带标签的卡片"
  )

  // 命令：打开卡片浏览器
  orca.commands.registerCommand(
    `${pluginName}.openCardBrowser`,
    () => {
      console.log(`[${pluginName}] 打开卡片浏览器`)
      openCardBrowser()
    },
    "SRS: 打开卡片浏览器"
  )

  // ========================================
  // 2. 注册编辑器命令：将当前块转换为 SRS 卡片（调试用）
  // ========================================
  orca.commands.registerEditorCommand(
    `${pluginName}.makeCardFromBlock`,
    // do 函数：执行转换
    async (editor, ...args) => {
      const [panelId, rootBlockId, cursor, isRedo] = editor
      if (!cursor) {
        orca.notify("error", "无法获取光标位置")
        return null
      }
      const result = await makeCardFromBlock(cursor)
      return result ? { ret: result, undoArgs: result } : null
    },
    // undo 函数：撤销转换（恢复原始 _repr）
    async (undoArgs: any) => {
      if (!undoArgs || !undoArgs.blockId) return

      const block = orca.state.blocks[undoArgs.blockId] as BlockWithRepr
      if (!block) return

      // 恢复原始 _repr
      block._repr = undoArgs.originalRepr || { type: "text" }

      console.log(`[${pluginName}] 已撤销：块 #${undoArgs.blockId} 已恢复`)
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: false
    }
  )

  // ========================================
  // 2. 注册工具栏按钮
  // ========================================
  orca.toolbar.registerToolbarButton(`${pluginName}.reviewButton`, {
    icon: "ti ti-cards",  // 使用 Tabler Icons 的卡片图标
    tooltip: "开始 SRS 复习",
    command: `${pluginName}.startReviewSession`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.browserButton`, {
    icon: "ti ti-list",  // 使用 Tabler Icons 的列表图标
    tooltip: "打开卡片浏览器",
    command: `${pluginName}.openCardBrowser`
  })

  // ========================================
  // 3. 注册斜杠命令
  // ========================================

  // 斜杠命令：开始复习
  orca.slashCommands.registerSlashCommand(`${pluginName}.review`, {
    icon: "ti ti-cards",
    group: "SRS",
    title: "开始 SRS 复习",
    command: `${pluginName}.startReviewSession`
  })

  // 斜杠命令：转换为 SRS 卡片
  orca.slashCommands.registerSlashCommand(`${pluginName}.makeCard`, {
    icon: "ti ti-card-plus",
    group: "SRS",
    title: "转换为记忆卡片",
    command: `${pluginName}.makeCardFromBlock`
  })

  // 斜杠命令：扫描带标签的卡片
  orca.slashCommands.registerSlashCommand(`${pluginName}.scanTags`, {
    icon: "ti ti-scan",
    group: "SRS",
    title: "扫描带标签的卡片",
    command: `${pluginName}.scanCardsFromTags`
  })

  // 斜杠命令：打开卡片浏览器
  orca.slashCommands.registerSlashCommand(`${pluginName}.browser`, {
    icon: "ti ti-list",
    group: "SRS",
    title: "打开卡片浏览器",
    command: `${pluginName}.openCardBrowser`
  })

  // ========================================
  // 4. 注册自定义块渲染器：SRS 卡片
  // ========================================
  orca.renderers.registerBlock(
    "srs.card",           // 块类型
    false,                // 不可作为纯文本编辑
    SrsCardBlockRenderer, // 渲染器组件
    [],                   // 无需 asset 字段
    false                 // 不使用自定义子块布局
  )

  // ========================================
  // 5. 注册 plain 转换器（必需）
  // ========================================
  // 将 SRS 卡片块转换为纯文本格式（用于导出、复制等）
  orca.converters.registerBlock(
    "plain",
    "srs.card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（无题目）"
      const back = repr.back || "（无答案）"
      return `[SRS 卡片]\n题目: ${front}\n答案: ${back}`
    }
  )

  console.log(`[${pluginName}] 命令、UI 组件和渲染器已注册`)
}

/**
 * 插件卸载函数
 * 在插件禁用时被 Orca 调用
 */
export async function unload() {
  console.log(`[${pluginName}] 开始卸载插件`)

  // 清理复习会话组件
  closeReviewSession()

  // 清理卡片浏览器组件
  closeCardBrowser()

  // 移除注册的命令
  orca.commands.unregisterCommand(`${pluginName}.startReviewSession`)
  orca.commands.unregisterCommand(`${pluginName}.scanCardsFromTags`)
  orca.commands.unregisterCommand(`${pluginName}.openCardBrowser`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeCardFromBlock`)

  // 移除工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.reviewButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.browserButton`)

  // 移除斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.review`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.scanTags`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.browser`)

  // 移除块渲染器
  orca.renderers.unregisterBlock("srs.card")

  // 移除转换器
  orca.converters.unregisterBlock("plain", "srs.card")

  console.log(`[${pluginName}] 插件已卸载`)
}

// ========================================
// 辅助函数：开始复习会话
// ========================================
/**
 * 显示 SRS 复习会话组件（使用真实队列）
 */
async function startReviewSession() {
  if (reviewSessionContainer) {
    closeReviewSession()
  }

  try {
    const cards = await collectReviewCards()
    const queue = buildReviewQueue(cards)

    if (queue.length === 0) {
      orca.notify("info", "今天没有需要复习的到期卡或新卡", { title: "SRS 复习" })
      return
    }

    reviewSessionContainer = document.createElement("div")
    reviewSessionContainer.id = "srs-review-session-container"
    document.body.appendChild(reviewSessionContainer)

    const React = window.React
    const { createRoot } = window
    reviewSessionRoot = createRoot(reviewSessionContainer)

    reviewSessionRoot.render(
      React.createElement(SrsReviewSessionDemo, {
        cards: queue,
        onClose: () => {
          console.log(`[${pluginName}] 用户关闭复习会话`)
          closeReviewSession()
        }
      })
    )

    const dueCount = queue.filter(card => !card.isNew).length
    const newCount = queue.filter(card => card.isNew).length

    console.log(`[${pluginName}] SRS 复习会话已开始，队列 ${queue.length} 张（到期 ${dueCount} / 新卡 ${newCount}）`)
    orca.notify(
      "info",
      `复习会话已开始，到期 ${dueCount} 张，新卡 ${newCount} 张`,
      { title: "SRS 复习" }
    )
  } catch (error) {
    console.error(`[${pluginName}] 启动复习失败:`, error)
    orca.notify("error", `启动复习失败: ${error}`, { title: "SRS 复习" })
  }
}

/**
 * 关闭 SRS 复习会话组件
 * 清理 DOM 和 React root
 */
function closeReviewSession() {
  if (reviewSessionRoot) {
    reviewSessionRoot.unmount()
    reviewSessionRoot = null
  }

  if (reviewSessionContainer) {
    reviewSessionContainer.remove()
    reviewSessionContainer = null
  }

  console.log(`[${pluginName}] SRS 复习会话已关闭`)
}

const isSrsCardBlock = (block: BlockWithRepr) =>
  block._repr?.type === "srs.card" ||
  block.properties?.some(prop => prop.name === "srs.isCard")

const getFirstChildText = (block: BlockWithRepr) => {
  if (!block?.children || block.children.length === 0) return "（无答案）"
  const firstChildId = block.children[0]
  const firstChild = orca.state.blocks?.[firstChildId] as BlockWithRepr | undefined
  return firstChild?.text || "（无答案）"
}

const resolveFrontBack = (block: BlockWithRepr) => {
  const front = block._repr?.front ?? block.text ?? "（无题目）"
  const back = block._repr?.back ?? getFirstChildText(block)
  return { front, back }
}

const collectSrsBlocks = async (): Promise<BlockWithRepr[]> => {
  const tagged = (await orca.invokeBackend("get-blocks-with-tags", ["card"])) as BlockWithRepr[] | undefined
  const stateBlocks = Object.values(orca.state.blocks || {})
    .filter((b): b is BlockWithRepr => !!b && (b as BlockWithRepr)._repr?.type === "srs.card")

  const merged = new Map<DbId, BlockWithRepr>()
  for (const block of [...(tagged || []), ...stateBlocks]) {
    if (!block) continue
    merged.set(block.id, block as BlockWithRepr)
  }
  return Array.from(merged.values())
}

const collectReviewCards = async (): Promise<ReviewCard[]> => {
  const blocks = await collectSrsBlocks()
  const now = new Date()
  const cards: ReviewCard[] = []

  for (const block of blocks) {
    if (!isSrsCardBlock(block)) continue
    const { front, back } = resolveFrontBack(block)
    const hasSrsProps = block.properties?.some(prop => prop.name.startsWith("srs."))
    const srsState = hasSrsProps
      ? await loadCardSrsState(block.id)
      : await writeInitialSrsState(block.id, now)

    cards.push({
      id: block.id,
      front,
      back,
      srs: srsState,
      isNew: !srsState.lastReviewed || srsState.reps === 0
    })
  }

  return cards
}

const buildReviewQueue = (cards: ReviewCard[]): ReviewCard[] => {
  const today = new Date()
  const dueCards = cards.filter(card => !card.isNew && card.srs.due.getTime() <= today.getTime())
  const newCards = cards.filter(card => card.isNew)

  const queue: ReviewCard[] = []
  let dueIndex = 0
  let newIndex = 0

  while (dueIndex < dueCards.length || newIndex < newCards.length) {
    for (let i = 0; i < 2 && dueIndex < dueCards.length; i++) {
      queue.push(dueCards[dueIndex++])
    }
    if (newIndex < newCards.length) {
      queue.push(newCards[newIndex++])
    }
  }

  return queue
}

// ========================================
// 辅助函数：扫描带标签的块并转换为 SRS 卡片
// ========================================
/**
 * 扫描所有带 #card 标签的块，并将它们转换为 SRS 卡片
 *
 * 处理逻辑：
 * 1. 获取所有带 #card 标签的块
 * 2. 对每个块：
 *    - 父块文本作为题目（front）
 *    - 第一个子块文本作为答案（back）
 *    - 从 #deck/xxx 标签中解析 deck 名称
 *    - 设置 _repr.type = "srs.card"
 *    - 设置初始 SRS 属性
 */
async function scanCardsFromTags() {
  console.log(`[${pluginName}] 开始扫描带 #card 标签的块...`)

  try {
    // 1. 获取所有带 #card 标签的块
    const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", ["card"]) as Block[]

    if (!taggedBlocks || taggedBlocks.length === 0) {
      orca.notify("info", "没有找到带 #card 标签的块", { title: "SRS 扫描" })
      console.log(`[${pluginName}] 未找到任何带 #card 标签的块`)
      return
    }

    console.log(`[${pluginName}] 找到 ${taggedBlocks.length} 个带 #card 标签的块`)

    let convertedCount = 0
    let skippedCount = 0

    // 2. 处理每个块
    for (const block of taggedBlocks) {
      const blockWithRepr = block as BlockWithRepr

      // 如果已经是 srs.card 类型，跳过
      if (blockWithRepr._repr?.type === "srs.card") {
        console.log(`[${pluginName}] 跳过：块 #${block.id} 已经是 SRS 卡片`)
        skippedCount++
        continue
      }

      const { front, back } = resolveFrontBack(blockWithRepr)

      // c. 从标签中解析 deck 名称
      // 遍历 block.refs，找到标签引用（type === 2），检查是否是 deck 标签
      let deckName: string | undefined = undefined
      if (block.refs && block.refs.length > 0) {
        for (const ref of block.refs) {
          // type === 2 表示这是一个标签引用（Property reference）
          if (ref.type === 2) {
            const tagAlias = ref.alias || ""
            // 检查是否是 deck 标签（格式：deck/名称）
            if (tagAlias.startsWith("deck/")) {
              deckName = tagAlias.substring(5) // 提取 "deck/" 之后的部分
              break
            }
          }
        }
      }

      // d. 设置 _repr（直接修改，Valtio 会触发响应式更新）
      blockWithRepr._repr = {
        type: "srs.card",
        front: front,
        back: back,
        ...(deckName && { deck: deckName }) // 如果有 deck，则添加
      }

      // e. 设置初始 SRS 属性（如果块还没有这些属性）
      const hasSrsProperties = block.properties?.some(
        prop => prop.name.startsWith("srs.")
      )

      if (!hasSrsProperties) {
        await writeInitialSrsState(block.id)
      }

      console.log(`[${pluginName}] 已转换：块 #${block.id}`)
      console.log(`  题目: ${front}`)
      console.log(`  答案: ${back}`)
      if (deckName) {
        console.log(`  Deck: ${deckName}`)
      }

      convertedCount++
    }

    // 显示结果通知
    const message = `转换了 ${convertedCount} 张卡片${skippedCount > 0 ? `，跳过 ${skippedCount} 张已有卡片` : ""}`
    orca.notify("success", message, { title: "SRS 扫描完成" })
    console.log(`[${pluginName}] 扫描完成：${message}`)

  } catch (error) {
    console.error(`[${pluginName}] 扫描失败:`, error)
    orca.notify("error", `扫描失败: ${error}`, { title: "SRS 扫描" })
  }
}

// ========================================
// 辅助函数：将块转换为 SRS 卡片
// ========================================
/**
 * 将当前块转换为 SRS 卡片块
 * - 当前块的文本作为题目（front）
 * - 第一个子块的文本作为答案（back），如果没有子块则使用默认答案
 *
 * @param cursor 当前光标位置
 * @returns 转换结果（包含 blockId 和原始 _repr，供 undo 使用）
 */
async function makeCardFromBlock(cursor: CursorData) {
  if (!cursor || !cursor.anchor || !cursor.anchor.blockId) {
    orca.notify("error", "无法获取当前块位置")
    return null
  }

  const blockId = cursor.anchor.blockId
  const block = orca.state.blocks[blockId] as BlockWithRepr

  if (!block) {
    orca.notify("error", "未找到当前块")
    return null
  }

  // 保存原始 _repr 供撤销使用
  const originalRepr = block._repr ? { ...block._repr } : { type: "text" }

  const { front, back } = resolveFrontBack(block)

  // 直接修改块的 _repr（Valtio 会自动触发响应式更新）
  block._repr = {
    type: "srs.card",
    front: front,
    back: back
  }

  await writeInitialSrsState(blockId)

  console.log(`[${pluginName}] 块 #${blockId} 已转换为 SRS 卡片`)
  console.log(`  题目: ${front}`)
  console.log(`  答案: ${back}`)

  // 显示通知
  orca.notify(
    "success",
    "已转换为 SRS 记忆卡片",
    { title: "SRS" }
  )

  // 返回结果供 undo 使用
  return { blockId, originalRepr }
}

// ========================================
// 辅助函数：打开和关闭卡片浏览器
// ========================================
/**
 * 打开卡片浏览器
 */
function openCardBrowser() {
  // 如果浏览器已经打开，先关闭
  if (cardBrowserContainer) {
    closeCardBrowser()
  }

  // 创建容器
  cardBrowserContainer = document.createElement("div")
  cardBrowserContainer.id = "srs-card-browser-container"
  document.body.appendChild(cardBrowserContainer)

  // 使用 React 18 的 createRoot API 渲染组件
  const React = window.React
  const { createRoot } = window
  cardBrowserRoot = createRoot(cardBrowserContainer)

  cardBrowserRoot.render(
    React.createElement(SrsCardBrowser, {
      onClose: () => {
        console.log(`[${pluginName}] 用户关闭卡片浏览器`)
        closeCardBrowser()
      }
    })
  )

  console.log(`[${pluginName}] 卡片浏览器已打开`)
}

/**
 * 关闭卡片浏览器
 */
function closeCardBrowser() {
  if (cardBrowserRoot) {
    cardBrowserRoot.unmount()
    cardBrowserRoot = null
  }

  if (cardBrowserContainer) {
    cardBrowserContainer.remove()
    cardBrowserContainer = null
  }

  console.log(`[${pluginName}] 卡片浏览器已关闭`)
}
