# 复习界面侧边面板化设计方案

## 📋 需求概述

将 SRS 复习界面从**全屏模态框**改为**侧边面板**形式，实现以下目标：

### 当前行为
- 用户点击"开始 SRS 复习"按钮
- 复习界面以全屏模态框（`ModalOverlay`）形式出现
- 模态框遮挡整个编辑器
- 用户需要关闭复习界面才能编辑卡片

### 目标行为
- 用户点击"开始 SRS 复习"按钮
- 复习界面在**右侧面板**中打开（类似 Shift+左键打开侧边面板）
- **左侧主面板**保持编辑功能
- 用户点击复习界面中的"跳转到卡片"按钮时：
  - 左侧主面板自动显示该卡片的**原生 block** 编辑界面
  - 焦点切换到左侧面板，用户可以立即编辑
  - 右侧复习界面保持打开，用户可以继续复习
- 实现**实时编辑 + 持续复习**的无缝体验

---

## 🏗️ 技术方案

### 方案选择：特殊块 + 自定义渲染器

**核心思路**：
由于 Orca 的 panel 系统只支持 `"block"` 和 `"journal"` 两种视图类型，我们需要：
1. 创建一个特殊的"复习会话块"（系统块）
2. 为该块注册自定义渲染器 `srs.review-session`
3. 使用 `orca.nav.addTo()` 在右侧创建 panel，显示该块

**优点**：
- 真正的 Orca panel，完全集成到导航系统
- 可以使用 Orca 的原生 panel 操作（调整大小、关闭、历史导航等）
- 用户体验与 Orca 原生功能一致

---

## 🔧 实现步骤

### 第一步：创建复习会话块管理器

**文件：`src/srs/reviewSessionManager.ts`**

```typescript
import type { DbId } from "../orca.d.ts"

/**
 * 复习会话块管理器
 * 负责创建、获取和清理复习会话块
 */

// 存储复习会话块 ID（使用插件数据持久化）
let reviewSessionBlockId: DbId | null = null

/**
 * 获取或创建复习会话块
 *
 * @param pluginName - 插件名称
 * @returns 复习会话块 ID
 */
export async function getOrCreateReviewSessionBlock(pluginName: string): Promise<DbId> {
  // 1. 尝试从插件数据中读取已存在的块 ID
  const storedId = await orca.plugins.getData(pluginName, "reviewSessionBlockId")

  if (storedId && typeof storedId === "number") {
    // 验证块是否仍然存在
    const block = orca.state.blocks?.[storedId]
    if (block) {
      reviewSessionBlockId = storedId
      return storedId
    }
  }

  // 2. 如果块不存在，创建新块
  const newBlockId = await createReviewSessionBlock(pluginName)

  // 3. 保存块 ID 到插件数据
  await orca.plugins.setData(pluginName, "reviewSessionBlockId", newBlockId)

  reviewSessionBlockId = newBlockId
  return newBlockId
}

/**
 * 创建复习会话块
 *
 * @param pluginName - 插件名称
 * @returns 新创建的块 ID
 */
async function createReviewSessionBlock(pluginName: string): Promise<DbId> {
  // 使用 core.editor.createBlocks 创建一个新块
  const result = await orca.commands.invokeEditorCommand(
    "core.editor.createBlocks",
    null, // editor context
    [{
      text: `[SRS 复习会话 - ${pluginName}]`,
      properties: [
        { name: "srs.isReviewSessionBlock", value: true },
        { name: "srs.pluginName", value: pluginName }
      ]
    }],
    false // isRedo
  )

  if (!result || !result.ret || result.ret.length === 0) {
    throw new Error("创建复习会话块失败")
  }

  const blockId = result.ret[0].id

  // 设置 _repr.type 为 "srs.review-session"
  const block = orca.state.blocks?.[blockId] as any
  if (block) {
    block._repr = {
      type: "srs.review-session"
    }
  }

  console.log(`[${pluginName}] 创建复习会话块: #${blockId}`)
  return blockId
}

/**
 * 清理复习会话块（可选）
 *
 * @param pluginName - 插件名称
 */
export async function cleanupReviewSessionBlock(pluginName: string): Promise<void> {
  if (!reviewSessionBlockId) return

  // 可选：删除块
  // await orca.commands.invokeEditorCommand(
  //   "core.editor.deleteBlocks",
  //   null,
  //   [reviewSessionBlockId],
  //   false
  // )

  // 清理插件数据
  await orca.plugins.removeData(pluginName, "reviewSessionBlockId")
  reviewSessionBlockId = null
}
```

---

### 第二步：创建复习会话渲染器

**文件：`src/components/SrsReviewSessionRenderer.tsx`**

```typescript
/**
 * SRS 复习会话渲染器
 *
 * 作为块渲染器，在 panel 中显示复习会话界面
 */
import type { DbId } from "../orca.d.ts"
import SrsReviewSessionDemo from "./SrsReviewSessionDemo"

const { useState, useEffect } = window.React
const { BlockShell } = orca.components

type SrsReviewSessionRendererProps = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
}

export default function SrsReviewSessionRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode
}: SrsReviewSessionRendererProps) {
  const [cards, setCards] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 加载复习队列
  useEffect(() => {
    loadReviewQueue()
  }, [])

  const loadReviewQueue = async () => {
    setIsLoading(true)
    try {
      // 调用 main.ts 中的 collectReviewCards 函数
      // 需要将其导出
      const { collectReviewCards } = await import("../main")
      const allCards = await collectReviewCards()

      // 构建复习队列
      const today = new Date()
      const dueCards = allCards.filter(
        card => !card.isNew && card.srs.due.getTime() <= today.getTime()
      )
      const newCards = allCards.filter(card => card.isNew)

      const queue: any[] = []
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

      setCards(queue)
    } catch (error) {
      console.error("[SRS Review Session Renderer] 加载复习队列失败:", error)
      orca.notify("error", `加载复习队列失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    // 关闭当前 panel
    orca.nav.close(panelId)
  }

  const handleJumpToCard = (cardBlockId: DbId) => {
    console.log(`[SRS Review Session Renderer] 跳转到卡片 #${cardBlockId}`)

    // 查找左侧主面板
    const leftPanelId = findLeftPanel(orca.state.panels, panelId)

    if (leftPanelId) {
      // 在左侧面板中打开卡片
      orca.nav.goTo("block", { blockId: cardBlockId }, leftPanelId)

      // 切换焦点到左侧面板
      orca.nav.switchFocusTo(leftPanelId)

      orca.notify("info", "已在左侧面板打开卡片，可以直接编辑")
    } else {
      // 如果没有左侧面板，在当前激活面板打开
      orca.nav.goTo("block", { blockId: cardBlockId })
      orca.notify("warn", "未找到左侧面板，已在当前面板打开")
    }
  }

  // 辅助函数：查找左侧面板
  const findLeftPanel = (node: any, currentPanelId: string): string | null => {
    if (!node) return null

    // 如果是水平分割且右侧是当前面板
    if (node.type === "hsplit" && node.children?.length === 2) {
      const leftPanel = node.children[0]
      const rightPanel = node.children[1]

      if (rightPanel?.id === currentPanelId || containsPanel(rightPanel, currentPanelId)) {
        return leftPanel?.id || null
      }
    }

    // 递归查找
    if (node.children) {
      for (const child of node.children) {
        const result = findLeftPanel(child, currentPanelId)
        if (result) return result
      }
    }

    return null
  }

  const containsPanel = (node: any, targetId: string): boolean => {
    if (!node) return false
    if (node.id === targetId) return true
    if (node.children) {
      return node.children.some((child: any) => containsPanel(child, targetId))
    }
    return false
  }

  // 渲染内容
  const contentJsx = isLoading ? (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
      fontSize: "14px",
      color: "var(--orca-color-text-2)"
    }}>
      加载复习队列中...
    </div>
  ) : (
    <SrsReviewSessionDemo
      cards={cards}
      onClose={handleClose}
      onJumpToCard={handleJumpToCard}
      inSidePanel={true}
    />
  )

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="srs-repr-review-session"
      contentClassName="srs-repr-review-session-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={contentJsx}
      childrenJsx={null}
    />
  )
}
```

---

### 第三步：修改 SrsReviewSessionDemo 组件

**文件：`src/components/SrsReviewSessionDemo.tsx`**

添加 `inSidePanel` 和 `onJumpToCard` props，适配两种模式：

```typescript
type SrsReviewSessionProps = {
  cards: ReviewCard[]
  onClose?: () => void
  onJumpToCard?: (blockId: DbId) => void  // 新增
  inSidePanel?: boolean  // 新增：是否在侧边面板中
}

export default function SrsReviewSession({
  cards,
  onClose,
  onJumpToCard,
  inSidePanel = false
}: SrsReviewSessionProps) {
  // ... 现有代码 ...

  const handleJumpToCard = (blockId: DbId) => {
    if (onJumpToCard) {
      // 使用传入的跳转函数（侧边面板模式）
      onJumpToCard(blockId)
    } else {
      // 默认行为（模态框模式）
      console.log(`[SRS Review Session] 跳转到卡片 #${blockId}`)
      orca.nav.goTo("block", { blockId })
      orca.notify("info", "已跳转到卡片，复习界面仍然保留")
    }
  }

  // 如果在侧边面板中，不使用 ModalOverlay
  if (inSidePanel) {
    return (
      <div className="srs-review-session" style={{
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}>
        {/* 复习进度条 */}
        <div style={{
          height: '4px',
          backgroundColor: 'var(--orca-color-bg-2)',
        }}>
          <div style={{
            height: '100%',
            width: `${(currentIndex / totalCards) * 100}%`,
            backgroundColor: 'var(--orca-color-primary-5)',
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* 进度文字提示 */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--orca-color-border-1)',
          fontSize: '14px',
          color: 'var(--orca-color-text-2)',
        }}>
          卡片 {currentIndex + 1} / {totalCards}（到期 {counters.due} | 新卡 {counters.fresh}）
        </div>

        {/* 当前卡片 */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          <SrsCardDemo
            front={currentCard.front}
            back={currentCard.back}
            onGrade={handleGrade}
            srsInfo={currentCard.srs}
            isGrading={isGrading}
            blockId={currentCard.id}
            onJumpToCard={handleJumpToCard}
          />
        </div>
      </div>
    )
  }

  // 原有的 ModalOverlay 模式
  return (
    <ModalOverlay visible={true} canClose={true} onClose={onClose}>
      {/* ... 现有代码 ... */}
    </ModalOverlay>
  )
}
```

---

### 第四步：修改 SrsCardDemo 组件

**文件：`src/components/SrsCardDemo.tsx`**

移除 `ModalOverlay`，改为普通 div（因为在侧边面板中不需要模态框）：

```typescript
export default function SrsCardDemo({
  front,
  back,
  onGrade,
  onClose,
  srsInfo,
  isGrading = false,
  blockId,
  onJumpToCard
}: SrsCardDemoProps) {
  // ... 现有代码 ...

  return (
    <div className="srs-card-container" style={{
      backgroundColor: 'var(--orca-color-bg-1)',
      borderRadius: '12px',
      padding: '32px',
      width: '100%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
    }}>
      {/* ... 现有卡片内容 ... */}
    </div>
  )
}
```

---

### 第五步：修改 main.ts 启动复习逻辑

**文件：`src/main.ts`**

```typescript
import { getOrCreateReviewSessionBlock } from "./srs/reviewSessionManager"

/**
 * 启动复习会话（在侧边面板中）
 */
async function startReviewSession(deckName?: string) {
  console.log(`[${pluginName}] 启动复习会话（侧边面板模式）`)

  try {
    // 1. 获取或创建复习会话块
    const reviewSessionBlockId = await getOrCreateReviewSessionBlock(pluginName)

    // 2. 获取当前激活面板
    const activePanelId = orca.state.activePanel
    if (!activePanelId) {
      orca.notify("warn", "当前没有可用的面板")
      return
    }

    // 3. 检查是否已有右侧面板
    const panels = orca.state.panels
    let rightPanelId = findRightPanel(panels, activePanelId)

    if (!rightPanelId) {
      // 4. 如果没有右侧面板，创建新面板
      rightPanelId = orca.nav.addTo(activePanelId, "right", {
        view: "block",
        viewArgs: { blockId: reviewSessionBlockId }
      })

      if (!rightPanelId) {
        orca.notify("error", "无法创建侧边面板")
        return
      }

      // 5. 设置面板宽度比例（60% / 40%）
      setTimeout(() => {
        try {
          const totalWidth = window.innerWidth || 1200
          const leftWidth = Math.max(700, Math.floor(totalWidth * 0.6))
          const rightWidth = totalWidth - leftWidth
          orca.nav.changeSizes(activePanelId, [leftWidth, rightWidth])
        } catch (error) {
          console.warn(`[${pluginName}] 调整面板宽度失败:`, error)
        }
      }, 50)
    } else {
      // 6. 如果已有右侧面板，在该面板中导航到复习会话块
      orca.nav.goTo("block", { blockId: reviewSessionBlockId }, rightPanelId)
    }

    // 7. 切换焦点到右侧面板
    if (rightPanelId) {
      setTimeout(() => {
        orca.nav.switchFocusTo(rightPanelId)
      }, 100)
    }

    orca.notify("success", "复习会话已在右侧面板打开", { title: "SRS 复习" })
    console.log(`[${pluginName}] 复习会话已启动，面板ID: ${rightPanelId}`)

  } catch (error) {
    console.error(`[${pluginName}] 启动复习会话失败:`, error)
    orca.notify("error", `启动复习失败: ${error}`)
  }
}

/**
 * 查找右侧面板
 */
function findRightPanel(node: any, currentPanelId: string): string | null {
  if (!node) return null

  // 如果是水平分割且左侧是当前面板
  if (node.type === "hsplit" && node.children?.length === 2) {
    const leftPanel = node.children[0]
    const rightPanel = node.children[1]

    if (leftPanel?.id === currentPanelId || containsPanel(leftPanel, currentPanelId)) {
      return rightPanel?.id || null
    }
  }

  // 递归查找
  if (node.children) {
    for (const child of node.children) {
      const result = findRightPanel(child, currentPanelId)
      if (result) return result
    }
  }

  return null
}

function containsPanel(node: any, targetId: string): boolean {
  if (!node) return false
  if (node.id === targetId) return true
  if (node.children) {
    return node.children.some((child: any) => containsPanel(child, targetId))
  }
  return false
}

// 在 load 函数中注册渲染器
export async function load(_name: string) {
  // ... 现有代码 ...

  // 注册复习会话渲染器
  orca.renderers.registerBlock(
    "srs.review-session",
    false,
    SrsReviewSessionRenderer,
    [],
    false
  )

  // ... 现有代码 ...
}

export async function unload() {
  // ... 现有代码 ...

  // 移除复习会话渲染器
  orca.renderers.unregisterBlock("srs.review-session")

  // ... 现有代码 ...
}

// 导出函数供渲染器使用
export { collectReviewCards, buildReviewQueue }
```

---

## 📊 数据流

```
用户点击"开始 SRS 复习"
    ↓
main.ts: startReviewSession()
    ↓
reviewSessionManager.ts: getOrCreateReviewSessionBlock()
    ├─ 创建/获取复习会话块
    └─ 设置 _repr.type = "srs.review-session"
    ↓
main.ts: orca.nav.addTo(activePanelId, "right", { blockId })
    ├─ 创建右侧面板
    └─ 设置面板宽度（60% / 40%）
    ↓
SrsReviewSessionRenderer 渲染
    ├─ 加载复习队列（collectReviewCards）
    └─ 渲染 SrsReviewSessionDemo
        ↓
        SrsCardDemo 显示卡片
        ↓
用户点击"跳转到卡片"
    ↓
SrsReviewSessionRenderer: handleJumpToCard(blockId)
    ├─ 查找左侧面板 ID
    ├─ orca.nav.goTo("block", { blockId }, leftPanelId)
    └─ orca.nav.switchFocusTo(leftPanelId)
    ↓
左侧面板显示卡片原生 block，用户可以编辑
右侧复习界面保持打开，用户继续复习
```

---

## 📝 文件修改清单

### 新建文件

1. **src/srs/reviewSessionManager.ts**
   - [ ] 创建 `getOrCreateReviewSessionBlock()` 函数
   - [ ] 创建 `createReviewSessionBlock()` 函数
   - [ ] 创建 `cleanupReviewSessionBlock()` 函数

2. **src/components/SrsReviewSessionRenderer.tsx**
   - [ ] 创建块渲染器组件
   - [ ] 实现 `loadReviewQueue()` 函数
   - [ ] 实现 `handleJumpToCard()` 函数
   - [ ] 实现面板查找辅助函数

### 修改文件

3. **src/main.ts**
   - [ ] 导入 `reviewSessionManager`
   - [ ] 重写 `startReviewSession()` 函数（侧边面板模式）
   - [ ] 添加 `findRightPanel()` 辅助函数
   - [ ] 注册 `srs.review-session` 渲染器
   - [ ] 导出 `collectReviewCards` 和 `buildReviewQueue`

4. **src/components/SrsReviewSessionDemo.tsx**
   - [ ] 添加 `inSidePanel` prop
   - [ ] 添加 `onJumpToCard` prop
   - [ ] 修改渲染逻辑（侧边面板模式 vs 模态框模式）
   - [ ] 修改 `handleJumpToCard` 函数

5. **src/components/SrsCardDemo.tsx**
   - [ ] 移除 `ModalOverlay`（可选，保持兼容性）
   - [ ] 或添加 `inSidePanel` prop 支持两种模式

---

## 🎨 用户体验流程

### 场景 1：从单面板开始

1. 用户在一个面板中查看笔记
2. 点击"开始 SRS 复习"按钮
3. **自动分割**：
   - 左侧 60%：原笔记内容（主编辑面板）
   - 右侧 40%：复习界面
4. 用户在右侧复习卡片
5. 点击"跳转到卡片"
6. **左侧面板自动切换**到该卡片的原生 block
7. **焦点切换**到左侧，用户可以立即编辑
8. 编辑完成后，焦点返回右侧继续复习

### 场景 2：已有左右面板

1. 用户已经有左右分割的面板布局
2. 点击"开始 SRS 复习"按钮
3. **复用右侧面板**：复习界面在右侧面板打开
4. 左侧面板保持当前内容
5. 后续流程同场景 1

### 场景 3：关闭复习界面

1. 用户可以使用 Orca 原生的面板关闭按钮
2. 或点击复习界面的"关闭"按钮
3. 右侧面板关闭，左侧面板恢复全宽

---

## ⚠️ 注意事项

### 1. 复习会话块的管理

- 复习会话块是一个**特殊的系统块**，用户不应直接编辑
- 块 ID 持久化存储在插件数据中
- 如果块被删除，下次启动会自动重新创建

### 2. 面板宽度控制

- 使用 `orca.nav.changeSizes()` 设置面板宽度
- 默认比例：60% 左（至少 700px）/ 40% 右
- 需要在面板创建后延迟调用（`setTimeout`）

### 3. 焦点管理

- 打开复习界面时，焦点在右侧复习面板
- 点击跳转后，焦点切换到左侧编辑面板
- 用户可以手动切换焦点

### 4. 兼容性

- **保留模态框模式**作为备选（可选）
- 如果面板操作失败，回退到模态框模式
- 或提供用户设置选择默认模式

### 5. 性能优化

- 复习队列加载可能较慢（如果卡片很多）
- 在渲染器中显示"加载中"状态
- 考虑缓存复习队列

---

## 🔄 实现顺序建议

1. **第一步**：创建 `reviewSessionManager.ts`（核心逻辑）
2. **第二步**：创建 `SrsReviewSessionRenderer.tsx`（渲染器）
3. **第三步**：修改 `main.ts`（注册渲染器和面板管理）
4. **第四步**：修改 `SrsReviewSessionDemo.tsx`（支持侧边面板模式）
5. **第五步**：测试和调优（面板宽度、焦点切换等）

---

## 🚀 后续优化

1. **键盘快捷键**：
   - `Ctrl+→` / `Ctrl+←`：切换左右面板焦点
   - `Esc`：从编辑面板返回复习面板

2. **面板状态记忆**：
   - 记住用户上次的面板布局
   - 下次打开复习时恢复

3. **多 deck 支持**：
   - 在复习界面顶部添加 deck 选择器
   - 切换 deck 时动态更新复习队列

4. **统计信息**：
   - 在复习界面顶部显示今日复习进度
   - 实时更新统计数据

---

## ✅ 验收标准

- [ ] 点击"开始 SRS 复习"后，复习界面在右侧面板打开
- [ ] 左侧主面板保持编辑功能
- [ ] 点击"跳转到卡片"后，左侧自动显示该卡片的原生 block
- [ ] 焦点自动切换到左侧面板
- [ ] 右侧复习界面保持打开
- [ ] 可以使用 Orca 原生面板操作（调整大小、关闭等）
- [ ] 面板宽度合理（左侧至少 700px）
- [ ] 如果只有一个面板，自动分割为左右布局
