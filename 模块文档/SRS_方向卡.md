# SRS 方向卡（Direction Card）

> **文档同步日期**：2026-07-13  
> **变更说明**：原「实现计划」长文（含大段未落地草稿代码）改为以当前仓库代码为准的实现文档。历史设计决策中与代码一致的部分保留为说明；过时计划删除。

---

## 概述

方向卡在文本中插入方向标记（箭头），把块内容分为左/右两侧问答，支持：

| 方向 | 符号（fragment.v） | 复习语义 | 生成 ReviewCard 数 |
| ---- | ------------------ | -------- | ------------------ |
| forward | `→` | 左问右答 | 1 |
| backward | `←` | 右问左答 | 1 |
| bidirectional | `↔` | 正反各一张 | 2（分天 due） |

### 用户操作

1. 在块中写好左侧文本，光标放在分界处（允许右侧先为空，便于继续输入答案）
2. 斜杠命令：
   - 「创建正向方向卡 →」→ `${pluginName}.createDirectionForward`
   - 「创建反向方向卡 ←」→ `${pluginName}.createDirectionBackward`
3. 点击编辑器内箭头可循环切换：`forward → backward → bidirectional → forward`
4. 右侧补全后才会进入复习队列

> 说明：旧计划中的 `Ctrl+Alt+.` / `Ctrl+Alt+,` 快捷键绑定以 `registry/commands.ts` 注释提及为准；UI 注册侧当前主要是斜杠命令（`uiComponents.tsx`），不以不存在的 `shortcuts.ts` 文件为准。

---

## 数据结构

### ContentFragment

```typescript
{
  t: `${pluginName}.direction`,
  v: "→" | "←" | "↔",
  direction: "forward" | "backward" | "bidirectional"
}
```

### 标签与表示

| 项 | 行为（当前实现） |
| -- | ---------------- |
| 标签 | `#card`，`type=direction` |
| `_repr` | **创建时不设** `srs.direction-card`，保持普通可编辑文本块（支持先插符号再输答案） |
| `srs.isCard` | `true` |

扫描 `scanCardsFromTags` 会**跳过** direction（不转换 `_repr`）。

### SRS 状态

前缀：`srs.forward.*` / `srs.backward.*`（字段同通用 FSRS：stability、difficulty、interval、due、lastReviewed、reps、lapses）

- 单向：只初始化对应方向，`daysOffset = 0`
- 双向：forward offset 0、backward offset 1
- 切换到 bidirectional 且尚无 `srs.backward.*` 时：`writeInitialDirectionSrsState(..., "backward", 1)`

### 身份

- `cardKey`：`direction:{blockId}:forward` 或 `direction:{blockId}:backward`
- `ReviewCard.directionType`: `"forward" | "backward"`

---

## 创建与切换

实现：`src/srs/directionUtils.ts`

### `insertDirection(cursor, direction, pluginName)`

1. 块内不得已有 direction fragment
2. 不得与 cloze 混用（检测 `${pluginName}.cloze`）
3. 左侧 trim 后非空；右侧允许空
4. `setBlocksContent` 写入：左文本 + direction fragment + 右文本
5. 标签：`buildCardTagData(..., "direction")` 或更新 `type`
6. `srs.isCard` + 初始化方向 SRS
7. 尝试把光标移到标记右侧，便于输入答案

### `cycleDirection` / `updateBlockDirection`

- 点击 `DirectionInlineRenderer` 调用 `cycleDirection` 后 `updateBlockDirection`
- 同步 fragment 的 `v` 与 `direction`；若存在 `_repr` 则更新其 `direction` 字段

### `extractDirectionInfo` / `getDirectionList`

- 解析左右文本与方向
- `getDirectionList`：bidirectional → `["forward","backward"]`，否则单元素数组

---

## 收集与复习

### 收集

`cardType === "direction"`：

1. `extractDirectionInfo` 失败 → 跳过
2. left 或 right 为空 → **未完成**，不入队
3. 按 `getDirectionList` 展开；`ensureDirectionSrsState(blockId, dir, daysOffsetIndex)`

### 复习 UI

`DirectionCardReviewRenderer`：

- 正向：`问题 → ❓/答案`
- 反向：`❓/答案 ← 问题`
- 显示答案后四档评分；支持只读回看
- 评分：`updateDirectionSrsState(blockId, directionType, grade, pluginName)`

`SrsCardDemo` 在 `directionType` 存在时路由到该渲染器（内部也可将类型归一为 `srs.direction-card` 语义用于分支）。

---

## 边界情况

| 场景 | 处理 |
| ---- | ---- |
| 已有箭头再插入 | 拒绝，提示点击切换 |
| 与 Cloze 同块 | 拒绝混用 |
| 左侧为空 | 拒绝创建 |
| 右侧为空 | 可创建，但不入复习队列 |
| 切换到双向 | 按需初始化 backward 状态 |

---

## 相关文件

| 路径 | 说明 |
| ---- | ---- |
| `src/srs/directionUtils.ts` | 插入、切换、解析 |
| `src/srs/storage.ts` | Direction SRS 读写 / ensure / update |
| `src/srs/cardCollector.ts` | 按方向展开队列 |
| `src/srs/cardIdentity.ts` | direction cardKey |
| `src/srs/reviewCardGrading.ts` | 评分 |
| `src/srs/registry/commands.ts` | createDirectionForward / Backward |
| `src/srs/registry/uiComponents.tsx` | 斜杠命令 |
| `src/srs/registry/renderers.ts` / `converters.ts` | inline + plain（`->`/`<-`/`<->`） |
| `src/components/DirectionInlineRenderer.tsx` | 编辑器箭头 |
| `src/components/DirectionCardReviewRenderer.tsx` | 复习界面 |
| `src/components/SrsCardDemo.tsx` | 路由 |
