# 渐进阅读增量改进路线图

本文档描述如何逐步将当前 MVP 实现升级为完整复刻 SuperMemo 18 渐进阅读核心理念的系统。

---

## SuperMemo 18 渐进阅读核心理念

SuperMemo 18 的渐进阅读不仅是"摘录 + 复习"，其核心价值在于：

1. **知识流水线**: Topic → Extract → Item 的三层提炼机制
2. **优先级驱动**: 所有元素按优先级排序，确保最重要的内容优先处理
3. **主动阅读**: 阅读过程中持续产出，而非被动消费
4. **间隔复习整合**: 阅读进度与记忆曲线深度结合

---

## 改进阶段

### 阶段一：优先级队列

**目标**: 为 Topic 和 Extract 引入优先级机制，实现按重要性排序。

#### 核心概念

- 每个 Topic/Extract 有一个 `priority` 值（0-100，数字越小优先级越高）
- 复习队列按优先级排序，而非纯 FSRS 到期时间
- 用户可以手动调整优先级

#### 需要实现的功能

1. **优先级属性**
   - 在 `#card` 标签上添加 `priority` 字段
   - 默认优先级：Topic=30, Extract=50
   - 支持通过快捷键快速调整（如 Alt+↑/↓）

2. **优先级队列算法**
   - 复习排序公式：`score = priority * w1 + overdueWeight * w2`
   - 权重可配置，平衡紧迫性与重要性

3. **优先级可视化**
   - 在卡片浏览器中显示优先级列
   - 在复习界面显示当前卡片优先级
   - 支持批量调整优先级

#### 技术要点

修改 `cardCollector.ts` 的排序逻辑，从纯 `due` 排序改为 `priority + due` 混合排序。

---

### 阶段二：Topic 作为可复习元素

**目标**: Topic 本身也进入复习队列，提醒用户"继续阅读"。

#### 核心概念

- Topic 不仅是 Extract 的容器，也是独立的复习单位
- Topic 复习 = 打开阅读界面，继续处理未读内容
- Topic 有独立的间隔调度（可以用 FSRS 或简化的固定间隔）

#### 需要实现的功能

1. **Topic 复习模式**
   - Topic 卡片显示"继续阅读"而非问答
   - 评分含义改变：Again=太难/没时间, Good=正常进度, Easy=快速浏览完

2. **阅读进度追踪**
   - 记录 Topic 中已处理的内容位置
   - 记录已产出的 Extract 数量
   - 估算剩余阅读量

3. **Topic 与 Extract 关联**
   - Topic 复习时可以直接创建新 Extract
   - Extract 复习时可以快速跳转到源 Topic

---

### 阶段三：Extract 深度提炼

**目标**: Extract 可以进一步提炼，产出更精细的 Item（传统问答卡片）。

#### 核心概念

SuperMemo 18 的完整流程：
```
Topic（文章）
  ↓ 摘录
Extract（段落）
  ↓ 提炼
Item（问答卡片）
```

当前 MVP 只实现到 Extract 层。完整实现需要支持 Extract → Item 的转换。

#### 需要实现的功能

1. **Extract 转换命令**
   - 从 Extract 创建 Cloze 卡片
   - 从 Extract 创建 Basic 问答卡片
   - 从 Extract 创建 Direction 卡片

2. **转换界面**
   - 复习 Extract 时显示"转换为卡片"按钮
   - 支持划词创建 Cloze
   - 支持 AI 辅助生成问答

3. **关系追踪**
   - Item 记录其来源 Extract ID
   - Extract 记录已产出的 Item 数量
   - 支持从 Item 回溯到源 Extract 和源 Topic

---

### 阶段四：阅读器深度集成

**目标**: 与虎鲸笔记的 EPUB 阅读器深度集成，实现真正的"边读边摘"。

#### 核心概念

当前实现需要用户手动复制粘贴内容。理想状态是在阅读器中直接划词创建 Extract。

#### 需要实现的功能

1. **划词摘录**
   - 在 EPUB 阅读器中选中文字后，显示"添加为 Extract"按钮
   - 自动创建子块并标记为 Extract
   - 保留原文位置信息，支持回溯

2. **高亮同步**
   - Extract 在原文中显示高亮
   - 删除 Extract 时，高亮同步删除
   - 支持多种高亮颜色表示不同优先级

3. **阅读进度可视化**
   - 显示文章中已摘录的比例
   - 标注哪些段落已产出 Item
   - 进度条显示整体处理状态

---

### 阶段五：智能辅助

**目标**: 利用 AI 提升渐进阅读效率。

#### 核心概念

AI 可以在多个环节提供辅助：
- 自动识别重要段落
- 自动生成问答卡片
- 智能调整优先级

#### 需要实现的功能

1. **智能摘录建议**
   - 分析文章内容，高亮推荐摘录的段落
   - 根据用户历史偏好学习
   - 支持手动确认/拒绝建议

2. **自动卡片生成**
   - Extract 复习时，AI 建议可能的问答卡片
   - 支持批量生成并人工审核
   - 支持多种卡片类型（Cloze/Basic/Direction）

3. **智能优先级**
   - 根据内容重要性自动设置初始优先级
   - 根据用户复习表现动态调整
   - 识别低效 Extract（反复失败但不产出 Item）

---

## 实现优先级建议

基于投入产出比，建议实现顺序：

| 优先级 | 功能 | 理由 |
|--------|------|------|
| P0 | 优先级队列 | 核心差异化功能，影响所有后续功能 |
| P1 | Extract → Item 转换 | 完成知识提炼闭环 |
| P2 | Topic 复习 | 推动用户持续阅读 |
| P3 | 阅读器集成 | 提升体验，但依赖虎鲸 API |
| P4 | 智能辅助 | 锦上添花，可后期迭代 |

---

## 技术债务处理

在增量改进过程中，需要同步处理以下技术债务：

### 1. 国际化

当前使用中文类型名（`渐进阅读`、`extracts`）：

```typescript
// 当前
type CardType = "basic" | "cloze" | "direction" | "渐进阅读" | "extracts"

// 改进后
type CardType = "basic" | "cloze" | "direction" | "ir-topic" | "ir-extract" | "ir-item"
```

需要提供迁移脚本，兼容旧数据。

### 2. 数据模型扩展

为支持优先级和关系追踪，需要扩展数据模型：

```typescript
interface ExtendedCardData {
  // 现有字段...

  // 新增字段
  priority?: number           // 优先级 (0-100)
  sourceTopicId?: DbId        // 来源 Topic
  sourceExtractId?: DbId      // 来源 Extract
  derivedItems?: DbId[]       // 派生的 Item
  readingProgress?: number    // 阅读进度 (0-100)
}
```

### 3. 性能优化

随着功能增加，需要关注：
- 优先级排序的性能（大量卡片时）
- 关系查询的效率（回溯源头时）
- 状态订阅的开销（自动标记时）

---

## 参考资料

- [SuperMemo 18 Incremental Reading Manual](https://help.supermemo.org/wiki/Incremental_learning)
- [Incremental Reading: The Essence](https://www.supermemo.com/en/articles/incremental)
- [Priority Queue in SuperMemo](https://help.supermemo.org/wiki/Priority_queue)

---

## 更新记录

- 2025-12-18: 创建增量改进路线图
