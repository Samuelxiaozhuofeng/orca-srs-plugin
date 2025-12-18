# 渐进阅读 MVP 实现计划

## 总体目标

基于SuperMemo 18渐进阅读理念，实现最简化的MVP：

- **Topic（主题）**: 用户上传EPUB的页面（标记为 `type: 渐进阅读`）
- **Extract（摘录）**: Topic下的所有子块，自动标记为 `type: extracts`
- **复习逻辑**: Extract作为Basic卡片进入FSRS复习队列

## 核心原则

1. **最激进简化**: 不引入优先级队列，复用现有FSRS算法
2. **自动化**: Topic的子块自动成为Extract，无需手动操作
3. **渐进验证**: 每个步骤都有前端交互验证点

---

## Step 1: Topic识别与子块扫描

### 目标
实现识别 `type: 渐进阅读` 的页面，并扫描其所有子块。

### 技术方案

#### 1.1 创建 `incrementalReadingUtils.ts`
```typescript
// src/srs/incrementalReadingUtils.ts

/**
 * 渐进阅读工具模块
 * 实现 SuperMemo 18 渐进阅读的 Topic → Extract 机制
 */

import type { Block, DbId } from "../orca.d.ts"
import { BlockWithRepr } from "./blockUtils"
import { extractCardType } from "./deckUtils"

/**
 * 判断块是否为渐进阅读 Topic
 * - 必须有 #card 标签
 * - type 属性必须为 "渐进阅读"
 */
export function isIncrementalReadingTopic(block: Block): boolean {
  const cardType = extractCardType(block)
  return cardType === "渐进阅读"
}

/**
 * 收集所有渐进阅读 Topic 块
 */
export async function collectIncrementalReadingTopics(
  pluginName: string = "srs-plugin"
): Promise<BlockWithRepr[]> {
  // 复用现有的 collectSrsBlocks 逻辑
  const { collectSrsBlocks } = await import("./cardCollector")
  const allCardBlocks = await collectSrsBlocks(pluginName)

  // 过滤出 type=渐进阅读 的块
  const topics = allCardBlocks.filter(block => {
    const cardType = extractCardType(block)
    return cardType === "渐进阅读"
  })

  console.log(`[${pluginName}] 找到 ${topics.length} 个渐进阅读 Topic`)
  return topics
}

/**
 * 获取 Topic 的所有子块（潜在的 Extract）
 */
export function getTopicChildBlocks(topicBlock: Block): Block[] {
  const children: Block[] = []

  if (!topicBlock.children || topicBlock.children.length === 0) {
    return children
  }

  for (const childId of topicBlock.children) {
    const childBlock = orca.state.blocks[childId] as Block
    if (childBlock) {
      children.push(childBlock)
    }
  }

  return children
}

/**
 * 扫描所有渐进阅读 Topic 及其子块
 * @returns { topics: Topic数组, extractCandidates: 子块总数 }
 */
export async function scanIncrementalReadingTopics(
  pluginName: string = "srs-plugin"
): Promise<{
  topics: BlockWithRepr[]
  extractCandidates: number
  topicDetails: Array<{ topicId: DbId; topicText: string; childCount: number }>
}> {
  const topics = await collectIncrementalReadingTopics(pluginName)
  let totalChildren = 0
  const topicDetails = []

  for (const topic of topics) {
    const children = getTopicChildBlocks(topic)
    totalChildren += children.length
    topicDetails.push({
      topicId: topic.id,
      topicText: topic.text || "(无标题)",
      childCount: children.length
    })
  }

  return {
    topics,
    extractCandidates: totalChildren,
    topicDetails
  }
}
```

#### 1.2 添加卡片类型 "渐进阅读"

修改 `src/srs/deckUtils.ts` 中的 `CardType` 类型：

```typescript
// 当前: type CardType = "basic" | "cloze" | "direction"
// 修改为:
export type CardType = "basic" | "cloze" | "direction" | "渐进阅读" | "extracts"
```

#### 1.3 创建扫描命令

修改 `src/srs/registry/commands.ts`，添加新命令：

```typescript
{
  id: "scan-incremental-reading-topics",
  title: "扫描渐进阅读Topic",
  async action() {
    const { scanIncrementalReadingTopics } = await import("../incrementalReadingUtils")
    const result = await scanIncrementalReadingTopics(PLUGIN_NAME)

    if (result.topics.length === 0) {
      orca.notify("info", "未找到渐进阅读Topic", {
        title: "渐进阅读扫描"
      })
      return
    }

    // 显示详细信息
    const details = result.topicDetails
      .map(t => `- ${t.topicText}: ${t.childCount} 个子块`)
      .join("\n")

    orca.notify("success",
      `找到 ${result.topics.length} 个Topic，共 ${result.extractCandidates} 个潜在Extract\n\n${details}`,
      { title: "渐进阅读扫描", duration: 5000 }
    )

    console.log(`[${PLUGIN_NAME}] 扫描结果:`, result)
  }
}
```

### 前端验证

1. 在Orca笔记中创建一个页面，添加EPUB阅读器（假设有 `<div class="orca-epub-reader-area">`）
2. 给该页面打上 `#card` 标签，设置 `type: 渐进阅读`
3. 在该页面下创建几个子块（模拟摘录的笔记）
4. 执行命令 `/扫描渐进阅读Topic`
5. **预期结果**:
   - 显示通知："找到 1 个Topic，共 X 个潜在Extract"
   - 通知中列出Topic名称和子块数量
   - 控制台输出详细的扫描结果

---

## Step 2: Extract自动标记

### 目标
为Topic的子块自动添加 `#card, type: extracts` 标签，使其成为可复习的Extract卡片。

### 技术方案

#### 2.1 扩展 `incrementalReadingUtils.ts`

```typescript
/**
 * 为块添加 Extract 标记
 * - 添加 #card 标签
 * - 设置 type: extracts
 */
async function markBlockAsExtract(
  blockId: DbId,
  pluginName: string
): Promise<boolean> {
  try {
    const block = orca.state.blocks[blockId] as Block
    if (!block) {
      console.error(`[${pluginName}] 块 ${blockId} 不存在`)
      return false
    }

    // 检查是否已有 #card 标签
    const hasCardTag = block.refs?.some(
      ref => ref.type === 2 && ref.alias?.toLowerCase() === "card"
    )

    if (hasCardTag) {
      // 已有标签，检查是否已是 extracts 类型
      const currentType = extractCardType(block)
      if (currentType === "extracts") {
        console.log(`[${pluginName}] 块 ${blockId} 已是 Extract，跳过`)
        return true
      }

      // 更新 type 为 extracts
      const cardRef = block.refs?.find(
        ref => ref.type === 2 && ref.alias?.toLowerCase() === "card"
      )
      if (cardRef) {
        await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          cardRef,
          [{ name: "type", value: "extracts" }]
        )
      }
    } else {
      // 添加 #card 标签并设置 type: extracts
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        blockId,
        "card",
        [
          { name: "type", value: "extracts" },
          { name: "牌组", value: [] },
          { name: "status", value: "" }
        ]
      )
    }

    // 设置 _repr
    const blockWithRepr = orca.state.blocks[blockId] as BlockWithRepr
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

    return true
  } catch (error) {
    console.error(`[${pluginName}] 标记 Extract 失败:`, error)
    return false
  }
}

/**
 * 批量标记 Topic 的子块为 Extract
 */
export async function markTopicChildrenAsExtracts(
  topicBlock: Block,
  pluginName: string = "srs-plugin"
): Promise<{ success: number; failed: number }> {
  const children = getTopicChildBlocks(topicBlock)
  let success = 0
  let failed = 0

  for (const child of children) {
    const result = await markBlockAsExtract(child.id, pluginName)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed }
}

/**
 * 批量标记所有渐进阅读 Topic 的子块
 */
export async function markAllExtractCandidates(
  pluginName: string = "srs-plugin"
): Promise<{
  topicsProcessed: number
  extractsMarked: number
  extractsFailed: number
}> {
  const topics = await collectIncrementalReadingTopics(pluginName)
  let totalSuccess = 0
  let totalFailed = 0

  for (const topic of topics) {
    const { success, failed } = await markTopicChildrenAsExtracts(topic, pluginName)
    totalSuccess += success
    totalFailed += failed
  }

  return {
    topicsProcessed: topics.length,
    extractsMarked: totalSuccess,
    extractsFailed: totalFailed
  }
}
```

#### 2.2 添加标记命令

修改 `src/srs/registry/commands.ts`：

```typescript
{
  id: "mark-extracts-automatically",
  title: "标记渐进阅读Extract",
  async action() {
    const { markAllExtractCandidates } = await import("../incrementalReadingUtils")

    orca.notify("info", "正在扫描并标记Extract...", {
      title: "渐进阅读"
    })

    const result = await markAllExtractCandidates(PLUGIN_NAME)

    if (result.extractsMarked === 0) {
      orca.notify("info", "未找到需要标记的Extract", {
        title: "渐进阅读"
      })
      return
    }

    orca.notify("success",
      `已标记 ${result.extractsMarked} 个Extract\n处理了 ${result.topicsProcessed} 个Topic${result.extractsFailed > 0 ? `\n失败: ${result.extractsFailed}` : ""}`,
      { title: "渐进阅读", duration: 3000 }
    )
  }
}
```

#### 2.3 初始化 Extract 的 SRS 状态

修改 `src/srs/storage.ts`，添加Extract初始化函数：

```typescript
/**
 * 为 Extract 卡片初始化 SRS 状态（立即可复习）
 */
export async function ensureExtractSrsState(
  blockId: DbId,
  now: Date = new Date()
): Promise<SrsState> {
  const key = `srs.${blockId}`
  const existing = await readData<SrsState>(key)

  if (existing) {
    return existing
  }

  // Extract 默认立即可复习
  const initialState = createInitialState(now, 0)
  await writeData(key, initialState)
  return initialState
}
```

#### 2.4 修改 `cardCollector.ts`

在 `collectReviewCards` 函数中添加对 `extracts` 类型的支持：

```typescript
// 在 collectReviewCards 函数中，识别卡片类型后添加：
else if (cardType === "extracts") {
  // Extract 卡片：文本内容为 Front，Back 为空/提示
  const srsState = await ensureExtractSrsState(block.id, now)

  cards.push({
    id: block.id,
    front: block.text || "(无内容)",
    back: "(回忆/理解这段内容)",
    srs: srsState,
    isNew: !srsState.lastReviewed || srsState.reps === 0,
    deck: deckName,
    tags: extractNonCardTags(block)
  })
}
```

### 前端验证

1. 继续使用Step 1创建的测试页面
2. 执行命令 `/标记渐进阅读Extract`
3. **预期结果**:
   - 显示通知："已标记 X 个Extract"
   - 所有子块自动添加了 `#card` 标签，`type: extracts`
4. 打开 Flashcard Home
5. **预期结果**:
   - 在卡片统计中看到新增的Extract卡片
   - 总卡片数增加

---

## Step 3: Extract复习界面

### 目标
创建Extract卡片的专用复习渲染器，实现"阅读理解"式的复习体验。

### 技术方案

#### 3.1 创建 Extract 复习渲染器

创建 `src/components/ExtractCardReviewRenderer.tsx`：

```tsx
/**
 * Extract 卡片复习渲染器
 *
 * 设计思路：
 * - Front: 显示Extract的完整文本内容
 * - Back: 显示提示文字"理解并回忆这段内容的要点"
 * - 评分逻辑：基于理解程度，而非准确回忆
 */

import { memo } from "react"
import type { ReviewCard } from "../srs/types"

interface ExtractCardReviewRendererProps {
  card: ReviewCard
  showAnswer: boolean
  onShowAnswer: () => void
  onGrade: (grade: "again" | "hard" | "good" | "easy") => void
}

export const ExtractCardReviewRenderer = memo(
  ({ card, showAnswer, onShowAnswer, onGrade }: ExtractCardReviewRendererProps) => {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "20px",
        boxSizing: "border-box"
      }}>
        {/* 卡片类型标识 */}
        <div style={{
          fontSize: "14px",
          color: "#666",
          marginBottom: "10px",
          fontWeight: "500"
        }}>
          📚 Extract（渐进阅读摘录）
        </div>

        {/* Front: Extract 内容 */}
        <div style={{
          flex: 1,
          fontSize: "18px",
          lineHeight: "1.8",
          marginBottom: "20px",
          padding: "20px",
          backgroundColor: "#f9f9f9",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          overflow: "auto"
        }}>
          {card.front}
        </div>

        {/* Back: 理解提示 */}
        {showAnswer && (
          <div style={{
            padding: "15px",
            backgroundColor: "#e3f2fd",
            borderRadius: "6px",
            marginBottom: "20px",
            fontSize: "16px",
            color: "#1976d2"
          }}>
            💡 {card.back}
          </div>
        )}

        {/* 操作按钮区域 */}
        {!showAnswer ? (
          <button
            onClick={onShowAnswer}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              alignSelf: "center"
            }}
          >
            显示提示 (空格)
          </button>
        ) : (
          <div style={{
            display: "flex",
            gap: "10px",
            justifyContent: "center"
          }}>
            <button
              onClick={() => onGrade("again")}
              style={{
                flex: 1,
                padding: "12px",
                fontSize: "15px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              不理解 (1)
            </button>
            <button
              onClick={() => onGrade("hard")}
              style={{
                flex: 1,
                padding: "12px",
                fontSize: "15px",
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              部分理解 (2)
            </button>
            <button
              onClick={() => onGrade("good")}
              style={{
                flex: 1,
                padding: "12px",
                fontSize: "15px",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              基本理解 (3)
            </button>
            <button
              onClick={() => onGrade("easy")}
              style={{
                flex: 1,
                padding: "12px",
                fontSize: "15px",
                backgroundColor: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              完全理解 (4)
            </button>
          </div>
        )}
      </div>
    )
  }
)

ExtractCardReviewRenderer.displayName = "ExtractCardReviewRenderer"
```

#### 3.2 注册 Extract 渲染器

修改 `src/srs/registry/renderers.ts`：

```typescript
import { ExtractCardReviewRenderer } from "../../components/ExtractCardReviewRenderer"

// 在 registerCardRenderers 函数中添加：
orca.ui.registerRenderer({
  id: "srs.extract-card.review",
  type: "block",
  match: (block) => {
    const reprType = (block as BlockWithRepr)._repr?.type
    return reprType === "srs.extract-card"
  },
  render: (props) => {
    // 复用现有的复习会话逻辑
    // 但使用 ExtractCardReviewRenderer 组件
    return <ExtractCardReviewRenderer {...props} />
  }
})
```

#### 3.3 修改复习会话管理器

修改 `src/srs/reviewSessionManager.ts`，识别 Extract 卡片类型：

```typescript
// 在 startReviewSession 或相关逻辑中，确保正确渲染 Extract 卡片
function getCardRenderer(card: ReviewCard) {
  if (card.clozeNumber !== undefined) {
    return "ClozeCardReviewRenderer"
  }
  if (card.directionType !== undefined) {
    return "DirectionCardReviewRenderer"
  }
  // 新增：识别 Extract 卡片
  const block = orca.state.blocks[card.id] as BlockWithRepr
  if (block?._repr?.type === "srs.extract-card") {
    return "ExtractCardReviewRenderer"
  }
  return "BasicCardReviewRenderer"
}
```

### 前端验证

1. 使用Step 2标记的Extract卡片
2. 打开复习界面（执行命令 `/打开复习面板`）
3. **预期结果**:
   - Extract卡片使用专用的复习界面
   - 显示"📚 Extract（渐进阅读摘录）"标识
   - Front区域显示完整的Extract文本
   - 点击"显示提示"后，显示蓝色提示框
   - 四个评分按钮文案改为："不理解/部分理解/基本理解/完全理解"
4. 完成评分后，卡片进入FSRS复习队列
5. 检查 SRS 数据存储
6. **预期结果**:
   - Extract的复习记录被正确保存
   - 下次复习时间按FSRS算法计算

---

## 验收标准

### 功能完整性
- ✅ 能识别 `type: 渐进阅读` 的Topic页面
- ✅ 能自动标记Topic子块为Extract
- ✅ Extract卡片能正常进入复习队列
- ✅ Extract卡片有专用的复习界面
- ✅ FSRS算法正常工作

### 用户体验
- ✅ 每个步骤都有明确的通知反馈
- ✅ FlashcardHome能正确显示Extract统计
- ✅ 复习界面交互流畅，按键响应正确

### 代码质量
- ✅ 复用现有基础设施（FSRS、存储、事件系统）
- ✅ 类型定义完整，无 TypeScript 错误
- ✅ 日志输出清晰，便于调试

---

## 未来扩展方向（本次MVP不实现）

1. **优先级队列**: 为Extract添加priority属性，按优先级排序
2. **Extract提炼**: Extract可以进一步提炼为更小的Extract
3. **Extract转换**: Extract可以转换为Cloze/Basic/Direction卡片
4. **EPUB集成**: 直接从EPUB阅读器划词生成Extract
5. **Topic复习**: Topic本身也可以作为"复习阅读"进入队列

---

## 技术债务记录

1. `type: 渐进阅读` 和 `type: extracts` 是中文，可能影响国际化
   - **解决方案**: 后续使用 `incremental-reading` 和 `ir-extract`
2. Extract的Back为固定提示，不够灵活
   - **解决方案**: 后续支持用户自定义提示模板
3. 自动标记子块可能误标用户不想复习的内容
   - **解决方案**: 后续添加"排除子块"的机制（如特定标签）
