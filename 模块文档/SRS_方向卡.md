# SRS 方向卡（Direction Card）

> **文档同步日期**：2026-08-09  
> **变更说明**：方向卡创建对称撤销（`undoDirectionCardCreation`）：只回滚本次新增的 `#card` / `srs.isCard` / 方向 SRS，并还原 content。  
> 2026-07-26：direction 值白名单双层防御。2026-07-13：改为以当前代码为准的实现文档。

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

前缀：`srs.forward.*` / `srs.backward.*`（字段同通用 FSRS：stability、difficulty、interval、due、lastReviewed、reps、lapses；`suspended` Boolean 仅暂停对应方向）

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
6. `srs.isCard` **写成功后** `invalidateBlockCache`，再初始化方向 SRS（`ensureDirectionSrsState` 走 `getBlockCached`，写后必须失效）
7. 尝试把光标移到标记右侧，便于输入答案
8. 返回值含对称撤销标志：`addedCardTag`、`wroteIsCard`、`initializedDirections`（仅本次 ensure **新写**的方向）、`originalContent`、`pluginName`

### 对称撤销（2026-08-09）

| 项 | 路径 |
| -- | ---- |
| Helper | `undoDirectionCardCreation`（`registry/cardCreationUndo.ts`） |
| 命令 | `createDirectionForward` / `createDirectionBackward` 的 undo 回调 |

撤销顺序：还原 `originalContent` → 删除 `initializedDirections` 上的 `srs.forward|backward.*` → 仅当 `wroteIsCard` 删 `srs.isCard` → 仅当 `addedCardTag` 摘 `#card`。任一步失败 `notify` + rethrow。创建前已是卡的块不得误删原有身份。

回归：`src/srs/registry/cardCreationUndo.test.ts`（`undoDirectionCardCreation`）。

### `cycleDirection` / `updateBlockDirection`

- 点击 `DirectionInlineRenderer` 调用 `cycleDirection` 后 `updateBlockDirection`
- 同步 fragment 的 `v` 与 `direction`；若存在 `_repr` 则更新其 `direction` 字段

### `extractDirectionInfo` / `getDirectionList`

- 解析左右文本与方向
- `getDirectionList`：bidirectional → `["forward","backward"]`，否则单元素数组

**direction 白名单双层防御（2026-07-26，低危#23）**——fragment 来自持久化块内容，属**不可信输入**（可被外部改写）：

1. **读取层** `extractDirectionInfo`：`direction` 必须落在白名单 `VALID_DIRECTIONS`（forward/backward/bidirectional）；缺失（falsy）沿用既有回退 `"forward"` **不告警**；契约外脏值 `console.warn` 后回退 `"forward"`。
2. **属性名门禁** `getDirectionList`：返回值会流入 `srs.<dir>.*` 属性名构建（`storage.ts buildDirectionPropertyName`），命名空间契约只允许 `srs.forward.*` / `srs.backward.*`——白名单外脏值 warn 后**返回 `[]`**，绝不进入属性写入（不生成 `srs.<garbage>.*` 契约外属性）。

### 删除变体（结构 + 进度，2026-08-09）

| 函数 | 说明 |
| ---- | ---- |
| `removeOrDowngradeDirectionInContent` | 纯函数：双向删一向 → 降级为剩余单向（更新 `direction` + 符号 `v`）；删最后一向 → **移除** direction fragment，左右片段原样保留（不合并） |
| `applyDirectionVariantRemoval` | 写库：`setBlocksContent` 后 `invalidateBlockCache`；失败抛错 |

入口：`deleteReviewCardBackendData`。顺序：**先改 content，再清 `srs.<dir>.*`**。仍有另一方向时保留 `#card`；无剩余方向则整卡清 `srs.*` + removeTag。

回归：`src/srs/directionUtils.test.ts`、`SrsFlashcardHome.delete.test.ts`。

---

## 收集与复习

### 收集

`cardType === "direction"`：

1. `extractDirectionInfo` 失败 → 跳过
2. left 或 right 为空 → **未完成**，不入队
3. 按 `getDirectionList` 展开；默认跳过 `srs.<dir>.suspended=true` 的方向
4. 其余方向执行 `ensureDirectionSrsState(blockId, dir, daysOffsetIndex)`

Flash Home include-suspended 路径返回暂停方向供逐方向恢复；正向暂停/恢复不影响反向。Direction 值仍先经白名单门禁，暂停属性名不得使用契约外方向。

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
