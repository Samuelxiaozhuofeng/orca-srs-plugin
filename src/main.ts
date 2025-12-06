import { setupL10N, t } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import SrsReviewSessionDemo from "./components/SrsReviewSessionDemo"
import SrsCardBlockRenderer from "./components/SrsCardBlockRenderer"
import type { BlockForConversion, Repr, CursorData, DbId, Block } from "./orca.d.ts"

// 扩展 Block 类型以包含 _repr 属性（运行时存在但类型定义中缺失）
type BlockWithRepr = Block & { _repr?: Repr }

let pluginName: string

// 用于存储当前显示的复习会话组件的容器和 root
let reviewSessionContainer: HTMLDivElement | null = null
let reviewSessionRoot: any = null

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
    () => {
      console.log(`[${pluginName}] 开始 SRS 复习会话`)
      startReviewSession()
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

  // 移除注册的命令
  orca.commands.unregisterCommand(`${pluginName}.startReviewSession`)
  orca.commands.unregisterCommand(`${pluginName}.scanCardsFromTags`)
  orca.commands.unregisterEditorCommand(`${pluginName}.makeCardFromBlock`)

  // 移除工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.reviewButton`)

  // 移除斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.review`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.scanTags`)

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
 * 显示 SRS 复习会话组件
 * 使用假数据创建一个完整的复习会话
 */
function startReviewSession() {
  // 如果已经打开复习会话，先关闭
  if (reviewSessionContainer) {
    closeReviewSession()
  }

  // 创建容器 div
  reviewSessionContainer = document.createElement("div")
  reviewSessionContainer.id = "srs-review-session-container"
  document.body.appendChild(reviewSessionContainer)

  // 获取 React 和 createRoot（从全局 window 对象）
  const React = window.React
  const { createRoot } = window

  // 创建 React root
  reviewSessionRoot = createRoot(reviewSessionContainer)

  // 渲染复习会话组件
  reviewSessionRoot.render(
    React.createElement(SrsReviewSessionDemo, {
      onClose: () => {
        console.log(`[${pluginName}] 用户关闭复习会话`)
        closeReviewSession()
      }
    })
  )

  console.log(`[${pluginName}] SRS 复习会话已开始`)

  // 显示通知
  orca.notify(
    "info",
    "复习会话已开始，共 5 张卡片",
    { title: "SRS 复习" }
  )
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

      // a. 读取父块内容作为题目（front）
      const front = block.text || "（无题目）"

      // b. 读取第一个子块内容作为答案（back）
      let back = "（无答案）"
      if (block.children && block.children.length > 0) {
        const firstChildId = block.children[0]
        const firstChild = orca.state.blocks[firstChildId]
        if (firstChild && firstChild.text) {
          back = firstChild.text
        }
      }

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
      // 检查块是否已有 SRS 属性
      const hasSrsProperties = block.properties?.some(
        prop => prop.name.startsWith("srs.")
      )

      if (!hasSrsProperties) {
        // 设置初始 SRS 属性
        await orca.commands.invokeEditorCommand(
          "core.editor.setProperties",
          null,
          [block.id],
          [
            { name: "srs.isCard", value: true, type: 4 },        // type: 4 = Boolean
            { name: "srs.due", value: new Date(), type: 5 },     // type: 5 = DateTime
            { name: "srs.interval", value: 1, type: 3 },         // type: 3 = Number
            { name: "srs.ease", value: 2.5, type: 3 },           // type: 3 = Number
            { name: "srs.reps", value: 0, type: 3 },             // type: 3 = Number
            { name: "srs.lapses", value: 0, type: 3 }            // type: 3 = Number
          ]
        )
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

  // 获取题目：使用当前块的纯文本
  const front = block.text || "（无题目）"

  // 获取答案：使用第一个子块的纯文本（如果存在）
  let back = "（无答案）"
  if (block.children && block.children.length > 0) {
    const firstChildId = block.children[0]
    const firstChild = orca.state.blocks[firstChildId]
    if (firstChild && firstChild.text) {
      back = firstChild.text
    }
  }

  // 直接修改块的 _repr（Valtio 会自动触发响应式更新）
  block._repr = {
    type: "srs.card",
    front: front,
    back: back
  }

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
