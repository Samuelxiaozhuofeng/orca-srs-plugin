import { setupL10N, t } from "./libs/l10n"
import zhCN from "./translations/zhCN"
import SrsReviewSessionRenderer from "./components/SrsReviewSessionRenderer"
import SrsCardBlockRenderer from "./components/SrsCardBlockRenderer"
import SrsCardBrowser from "./components/SrsCardBrowser"
import type { BlockForConversion, Repr, CursorData, DbId, Block } from "./orca.d.ts"
import { loadCardSrsState, writeInitialSrsState } from "./srs/storage"
import { getOrCreateReviewSessionBlock, cleanupReviewSessionBlock } from "./srs/reviewSessionManager"
import type { ReviewCard, DeckInfo, DeckStats } from "./srs/types"

// 扩展 Block 类型以包含 _repr 属性（运行时存在但类型定义中缺失）
type BlockWithRepr = Block & { _repr?: Repr }

let pluginName: string

/**
 * 去除文本中的 # 标签，用于展示时的视觉过滤
 */
const removeHashTags = (text: string): string => {
  if (!text) return text
  return text.replace(/#[\w/\u4e00-\u9fa5]+/g, "").trim()
}

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

  // 复习会话渲染器：用于侧边面板
  orca.renderers.registerBlock(
    "srs.review-session",
    false,
    SrsReviewSessionRenderer,
    [],
    false
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

  orca.converters.registerBlock(
    "plain",
    "srs.review-session",
    () => "[SRS 复习会话面板块]"
  )

  console.log(`[${pluginName}] 命令、UI 组件和渲染器已注册`)
}

/**
 * 插件卸载函数
 * 在插件禁用时被 Orca 调用
 */
export async function unload() {
  console.log(`[${pluginName}] 开始卸载插件`)

  // 清理卡片浏览器组件
  closeCardBrowser()

  await cleanupReviewSessionBlock(pluginName)

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
  orca.renderers.unregisterBlock("srs.review-session")

  // 移除转换器
  orca.converters.unregisterBlock("plain", "srs.card")
  orca.converters.unregisterBlock("plain", "srs.review-session")

  console.log(`[${pluginName}] 插件已卸载`)
}

// ========================================
// 辅助函数：开始复习会话
// ========================================
/**
 * 显示 SRS 复习会话组件（使用真实队列）
 */
async function startReviewSession(deckName?: string) {
  try {
    const reviewSessionBlockId = await getOrCreateReviewSessionBlock(pluginName)
    const activePanelId = orca.state.activePanel

    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" })
      return
    }

    let rightPanelId = findRightPanel(orca.state.panels, activePanelId)

    if (!rightPanelId) {
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId: reviewSessionBlockId },
        viewState: {}
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" })
        return
      }

      schedulePanelResize(activePanelId)
    } else {
      orca.nav.goTo("block", { blockId: reviewSessionBlockId }, rightPanelId)
    }

    if (rightPanelId) {
      const targetPanelId = rightPanelId
      setTimeout(() => {
        orca.nav.switchFocusTo(targetPanelId)
      }, 100)
    }

    const message = deckName
      ? `已打开 ${deckName} 复习会话`
      : "复习会话已在右侧面板打开"

    orca.notify("success", message, { title: "SRS 复习" })
    console.log(`[${pluginName}] 复习会话已启动，面板ID: ${rightPanelId}`)
  } catch (error) {
    console.error(`[${pluginName}] 启动复习失败:`, error)
    orca.notify("error", `启动复习失败: ${error}`, { title: "SRS 复习" })
  }
}

function findRightPanel(node: any, currentPanelId: string): string | null {
  if (!node) return null

  if (node.type === "hsplit" && node.children?.length === 2) {
    const [leftPanel, rightPanel] = node.children
    if (containsPanel(leftPanel, currentPanelId)) {
      return typeof rightPanel?.id === "string" ? rightPanel.id : extractPanelId(rightPanel)
    }
  }

  if (node.children) {
    for (const child of node.children) {
      const result = findRightPanel(child, currentPanelId)
      if (result) return result
    }
  }

  return null
}

function containsPanel(node: any, panelId: string): boolean {
  if (!node) return false
  if (node.id === panelId) return true
  if (!node.children) return false
  return node.children.some((child: any) => containsPanel(child, panelId))
}

function extractPanelId(node: any): string | null {
  if (!node) return null
  if (typeof node.id === "string") return node.id
  if (node.children) {
    for (const child of node.children) {
      const result = extractPanelId(child)
      if (result) return result
    }
  }
  return null
}

function schedulePanelResize(basePanelId: string) {
  setTimeout(() => {
    try {
      const totalWidth = window.innerWidth || 1200
      const leftWidth = Math.max(700, Math.floor(totalWidth * 0.6))
      const rightWidth = Math.max(360, totalWidth - leftWidth)
      orca.nav.changeSizes(basePanelId, [leftWidth, rightWidth])
    } catch (error) {
      console.warn(`[${pluginName}] 调整面板宽度失败:`, error)
    }
  }, 80)
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
  const frontRaw = block._repr?.front ?? block.text ?? "（无题目）"
  const backRaw = block._repr?.back ?? getFirstChildText(block)
  const front = removeHashTags(frontRaw)
  const back = removeHashTags(backRaw)
  return { front, back }
}

const collectSrsBlocks = async (): Promise<BlockWithRepr[]> => {
  // 尝试直接查询 #card 标签
  let tagged = (await orca.invokeBackend("get-blocks-with-tags", ["card"])) as BlockWithRepr[] | undefined
  
  // 如果直接查询无结果，使用备用方案获取所有块并过滤
  if (!tagged || tagged.length === 0) {
    console.log(`[${pluginName}] collectSrsBlocks: 直接查询无结果，使用备用方案`)
    try {
      // 备用方案1：尝试获取所有块
      const allBlocks = await orca.invokeBackend("get-all-blocks") as Block[] || []
      console.log(`[${pluginName}] collectSrsBlocks: get-all-blocks 返回了 ${allBlocks.length} 个块`)
      
      // 备用方案2：查询 #card 标签
      const possibleTags = ["card"]  // 移除所有 card/ 格式，只支持 #card
      let foundBlocks: Block[] = []

      for (const tag of possibleTags) {
        try {
          const taggedWithSpecific = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] || []
          console.log(`[${pluginName}] collectSrsBlocks: 标签 "${tag}" 找到 ${taggedWithSpecific.length} 个块`)
          foundBlocks = [...foundBlocks, ...taggedWithSpecific]
        } catch (e) {
          console.log(`[${pluginName}] collectSrsBlocks: 查询标签 "${tag}" 失败:`, e)
        }
      }
      
      if (foundBlocks.length > 0) {
        tagged = foundBlocks as BlockWithRepr[]
        console.log(`[${pluginName}] collectSrsBlocks: 多标签查询找到 ${tagged.length} 个带 #card 标签的块`)
      } else {
        // 最后备用方案：手动过滤所有块
        tagged = allBlocks.filter(block => {
          if (!block.refs || block.refs.length === 0) {
            console.log(`[${pluginName}] collectSrsBlocks: 块 #${block.id} 无 refs`)
            return false
          }
          
          const hasCardTag = block.refs.some(ref => {
            if (ref.type !== 2) {
              console.log(`[${pluginName}] collectSrsBlocks: 块 #${block.id} ref type 不是 2: ${ref.type}`)
              return false
            }
            const tagAlias = ref.alias || ""
            const isMatch = tagAlias === "card"  // 只匹配 #card，不支持 #card/xxx
            if (isMatch) {
              console.log(`[${pluginName}] collectSrsBlocks: 块 #${block.id} 匹配标签: ${tagAlias}`)
            }
            return isMatch
          })
          
          if (hasCardTag) {
            console.log(`[${pluginName}] collectSrsBlocks: 块 #${block.id} 有 #card 标签`)
          }
          
          return hasCardTag
        }) as BlockWithRepr[]
        console.log(`[${pluginName}] collectSrsBlocks: 手动过滤找到 ${tagged.length} 个带 #card 标签的块`)
      }
    } catch (error) {
      console.error(`[${pluginName}] collectSrsBlocks 备用方案失败:`, error)
      tagged = []
    }
  }
  
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

    // 从标签属性系统读取 deck 名称
    const deckName = extractDeckName(block)

    cards.push({
      id: block.id,
      front,
      back,
      srs: srsState,
      isNew: !srsState.lastReviewed || srsState.reps === 0,
      deck: deckName  // 新增字段
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

/**
 * 从块的标签属性系统中提取 deck 名称
 *
 * 工作原理：
 * 1. 找到 type=2 (RefType.Property) 且 alias="card" 的引用
 * 2. 从引用的 data 数组中找到 name="deck" 的属性
 * 3. 返回该属性的 value，如果不存在返回 "Default"
 *
 * 用户操作流程：
 * 1. 在 Orca 标签页面为 #card 标签定义属性 "deck"（类型：多选文本）
 * 2. 添加可选值（如 "English", "物理", "数学"）
 * 3. 给块打 #card 标签后，从下拉菜单选择 deck 值
 *
 * @param block - 块对象
 * @returns deck 名称，默认为 "Default"
 */
function extractDeckName(block: Block): string {
  // 边界情况：块没有引用
  if (!block.refs || block.refs.length === 0) {
    return "Default"
  }

  // 1. 找到 #card 标签引用
  const cardRef = block.refs.find(ref =>
    ref.type === 2 &&      // RefType.Property（标签引用）
    ref.alias === "card"   // 标签名称为 "card"
  )

  // 边界情况：没有找到 #card 标签引用
  if (!cardRef) {
    return "Default"
  }

  // 边界情况：标签引用没有关联数据
  if (!cardRef.data || cardRef.data.length === 0) {
    return "Default"
  }

  // 2. 从标签关联数据中读取 deck 属性
  const deckProperty = cardRef.data.find(d => d.name === "deck")

  // 边界情况：没有设置 deck 属性
  if (!deckProperty) {
    return "Default"
  }

  // 3. 返回 deck 值
  const deckValue = deckProperty.value

  // 处理多选类型（数组）和单选类型（字符串）
  if (Array.isArray(deckValue)) {
    // 多选类型：取数组的第一个值
    if (deckValue.length === 0 || !deckValue[0] || typeof deckValue[0] !== "string") {
      return "Default"
    }
    return deckValue[0].trim()
  } else if (typeof deckValue === "string") {
    // 单选类型：直接使用字符串
    if (deckValue.trim() === "") {
      return "Default"
    }
    return deckValue.trim()
  }

  // 其他类型：无效
  return "Default"
}

/**
 * 计算 deck 统计信息
 * 从 ReviewCard 列表中统计每个 deck 的卡片数量和到期情况
 */
function calculateDeckStats(cards: ReviewCard[]): DeckStats {
  const deckMap = new Map<string, DeckInfo>()

  // 遍历所有卡片，统计各 deck 信息
  for (const card of cards) {
    const deckName = card.deck

    if (!deckMap.has(deckName)) {
      deckMap.set(deckName, {
        name: deckName,
        totalCount: 0,
        newCount: 0,
        overdueCount: 0,
        todayCount: 0,
        futureCount: 0
      })
    }

    const deckInfo = deckMap.get(deckName)!
    deckInfo.totalCount++

    if (card.isNew) {
      deckInfo.newCount++
    } else {
      // 判断卡片属于哪个到期类别
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      if (card.srs.due < today) {
        deckInfo.overdueCount++
      } else if (card.srs.due >= today && card.srs.due < tomorrow) {
        deckInfo.todayCount++
      } else {
        deckInfo.futureCount++
      }
    }
  }

  const decks = Array.from(deckMap.values())

  // 排序：Default 在最前，其他按名称排序
  decks.sort((a, b) => {
    if (a.name === "Default" && b.name !== "Default") return -1
    if (a.name !== "Default" && b.name === "Default") return 1
    return a.name.localeCompare(b.name)
  })

  return {
    decks,
    totalCards: cards.length,
    totalNew: cards.filter(c => c.isNew).length,
    totalOverdue: cards.filter(c => {
      if (c.isNew) return false
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return c.srs.due < today
    }).length
  }
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
 *    - 从 #card 或 #card/xxx 标签中解析 deck 名称
 *    - 设置 _repr.type = "srs.card"
 *    - 设置初始 SRS 属性
 */
async function scanCardsFromTags() {
  console.log(`[${pluginName}] 开始扫描带 #card 标签的块...`)

  try {
    // 1. 获取所有带 #card 标签的块（包括 #card 和 #card/xxx 格式）
    const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", ["card"]) as Block[]
    
    // 如果 API 不支持层级标签查询，需要获取所有块然后过滤
    // 这里先尝试直接查询，如果结果为空则使用备用方案
    let allTaggedBlocks = taggedBlocks
    if (!taggedBlocks || taggedBlocks.length === 0) {
      console.log(`[${pluginName}] 直接查询 #card 标签无结果，尝试获取所有块并过滤`)
      try {
        // 备用方案1：尝试获取所有块
        const allBlocks = await orca.invokeBackend("get-all-blocks") as Block[] || []
        console.log(`[${pluginName}] get-all-blocks 返回了 ${allBlocks.length} 个块`)
        
        // 备用方案2：查询 #card 标签
        const possibleTags = ["card"]  // 移除所有 card/ 格式，只支持 #card
        let foundBlocks: Block[] = []

        for (const tag of possibleTags) {
          try {
            const taggedWithSpecific = await orca.invokeBackend("get-blocks-with-tags", [tag]) as Block[] || []
            console.log(`[${pluginName}] 标签 "${tag}" 找到 ${taggedWithSpecific.length} 个块`)
            foundBlocks = [...foundBlocks, ...taggedWithSpecific]
          } catch (e) {
            console.log(`[${pluginName}] 查询标签 "${tag}" 失败:`, e)
          }
        }
        
        if (foundBlocks.length > 0) {
          allTaggedBlocks = foundBlocks
          console.log(`[${pluginName}] 多标签查询找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)
        } else {
          // 最后备用方案：手动过滤所有块
          allTaggedBlocks = allBlocks.filter(block => {
            if (!block.refs || block.refs.length === 0) {
              console.log(`[${pluginName}] 块 #${block.id} 无 refs`)
              return false
            }
            
            const hasCardTag = block.refs.some(ref => {
              if (ref.type !== 2) {
                console.log(`[${pluginName}] 块 #${block.id} ref type 不是 2: ${ref.type}`)
                return false
              }
              const tagAlias = ref.alias || ""
              const isMatch = tagAlias === "card"  // 只匹配 #card，不支持 #card/xxx
              if (isMatch) {
                console.log(`[${pluginName}] 块 #${block.id} 匹配标签: ${tagAlias}`)
              }
              return isMatch
            })
            
            if (hasCardTag) {
              console.log(`[${pluginName}] 块 #${block.id} 有 #card 标签`)
            }
            
            return hasCardTag
          })
          console.log(`[${pluginName}] 手动过滤找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)
        }
      } catch (error) {
        console.error(`[${pluginName}] 备用方案失败:`, error)
        allTaggedBlocks = []
      }
    }

    if (!taggedBlocks || taggedBlocks.length === 0) {
      orca.notify("info", "没有找到带 #card 标签的块", { title: "SRS 扫描" })
      console.log(`[${pluginName}] 未找到任何带 #card 标签的块`)
      return
    }

    console.log(`[${pluginName}] 找到 ${allTaggedBlocks.length} 个带 #card 标签的块`)

    let convertedCount = 0
    let skippedCount = 0

    // 2. 处理每个块
    for (const block of allTaggedBlocks) {
      const blockWithRepr = block as BlockWithRepr

      // 如果已经是 srs.card 类型，跳过
      if (blockWithRepr._repr?.type === "srs.card") {
        console.log(`[${pluginName}] 跳过：块 #${block.id} 已经是 SRS 卡片`)
        skippedCount++
        continue
      }

      const { front, back } = resolveFrontBack(blockWithRepr)

      // c. 从标签属性系统中读取 deck 名称（block.refs[].data）
      const deckName = extractDeckName(block)

      // d. 设置 _repr（直接修改，Valtio 会触发响应式更新）
      blockWithRepr._repr = {
        type: "srs.card",
        front: front,
        back: back,
        deck: deckName  // 直接赋值，不再使用条件展开
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

// 导出供浏览器组件使用
export { calculateDeckStats, collectReviewCards, extractDeckName, startReviewSession, buildReviewQueue }
