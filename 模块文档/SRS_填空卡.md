# SRS 填空卡（Cloze）

> **文档同步日期**：2026-08-09  
> **变更说明**：删除填空变体时**解包结构 + 清进度**（`unwrapClozeNumberInContent` / `unwrapClozeFragmentsByNumber`），防止只清 `srs.cN.*` 后收集器从 fragment 复活。  
> 2026-07-29：IR Topic/Extract 挖空首次 due 走 `initialDuePolicy`；普通笔记 legacy。  
> 2026-07-26：导出 `isClozeFragment`；创建仅新编号初始写入；撤销必须还原正文。

---

## 概述

填空卡允许用户在块中将选中文本标记为填空，复习时按编号独立调度。每个 `clozeNumber` 拥有独立的 FSRS 状态与 `cardKey`。

### 用户操作

1. 在块中输入文本并选中要挖空的片段
2. 工具栏「创建 Cloze 填空」按钮，或命令 `${pluginName}.createCloze`
3. 选中文本变为 `${pluginName}.cloze` inline fragment；块自动带 `#card(type=cloze)`
4. 可对同一块多次挖空，编号自动递增（c1、c2、…）

命令入口经 `createClozeFromEditorCommand`（`irClozeCommandService.ts`）：若当前块是 `extracts` 类型会走 IR 转换路径（`convertExtractToItem`，策略 `keep_extract`：创建 Cloze、保留 Extract IR、不离开会话），否则调用 `createCloze()`。

---

## 数据结构

### ContentFragment

```typescript
{
  t: `${pluginName}.cloze`,  // 如 "orca-srs.cloze"
  v: "填空内容",
  clozeNumber: 1
}
```

### 标签与块表示

| 项 | 值 |
| -- | -- |
| 标签 | `#card`，`type=cloze` |
| `_repr.type` | `srs.cloze-card`（创建时写入；扫描路径同） |
| 持久化标记 | `srs.isCard = true`（Boolean 属性） |

### SRS 状态（按填空编号）

属性前缀：`srs.c{N}.`（如 `srs.c1.due`、`srs.c2.stability`）

| 字段 | 说明 |
| ---- | ---- |
| stability / difficulty / interval | FSRS 参数 |
| due / lastReviewed | 到期与上次复习 |
| reps / lapses | 次数统计 |
| suspended | Boolean；仅暂停当前 cN，不影响同块其它填空 |

**首次 due：**

| 路径 | 行为 |
|------|------|
| 普通笔记（`origin=standard`） | legacy：`daysOffset = clozeNumber - 1`（c1 今天、c2 明天……） |
| Topic / Extract / live IR **自身或其后代块**（`origin=ir_item`） | 祖先 walk 找到最近 `#card type=topic|extracts`（或 hybrid live IR），用其 `ir.priority`；默认 `dispersed`（约 1–14 天）；不叠加 clozeNumber-1。设置键 `review.irItemInitialDueMode` |

**仅本次新建的编号**由 `writeInitialClozeSrsState` 无条件写入初始状态；已存在的编号只经 `ensureClozeSrsState` 在缺属性时补齐，**绝不覆盖已有复习进度**（升级插件不会重排旧卡；见 `问题经验.md` 2026-07-26 二次挖空条目）。

### 身份（cardIdentity）

- `cardType`: `cloze`
- `cardKey` 格式：`cloze:{blockId}:c{clozeNumber}`
- 队列排序：按 `clozeNumber` 数值比较（避免字符串字典序导致 c10 < c2）

---

## 创建流程

实现：`src/srs/clozeUtils.ts` → `createCloze(cursor, pluginName, options?)`  
入口：`createClozeFromEditorCommand` → `getIrItemCreateOptionsForBlock`（向上找 Topic/Extract 祖先，正文子块挖空也算）。

1. 校验光标：同一块、同一 fragment 内有非空选区（不支持跨 fragment/跨样式选区）
2. `getMaxClozeNumberFromContent` → 下一编号（与读取侧共用 `isClozeFragment` 宽松判定，块内含旧前缀 `*.cloze` fragment 时不会重复分配其编号）
3. **`cloneBlockContent(block.content)` → `originalContent`**（深拷贝，供 undo；优先 `structuredClone`）
4. `buildNewContent`：在 fragment 内按 offset 拆分并插入 cloze fragment
5. `core.editor.setBlocksContent` 更新内容
6. 无 `#card` 则 `insertTag` + `buildCardTagData(..., "cloze")`；已有则 `setRefData` 将 `type` 设为 `cloze`
7. `ensureCardTagProperties` 初始化标签属性定义
8. 设置 `_repr`、`srs.isCard`；`srs.isCard` 写入后 `invalidateBlockCache(blockId)`，保证下一步 ensure 读到最新属性
9. 遍历 `getAllClozeNumbers`：**仅新建编号** `writeInitialClozeSrsState`（IR 路径传绝对 `initialDue`）；**已存在编号** `ensureClozeSrsState`（不覆盖）
10. 返回 undoArgs（含 `originalContent`、`clozeNumber`、`isFirstClozeCard`、可选 `initialDue` / `initialDueHint`）

### 撤销（`undoClozeCardCreation`）

1. 若有 `originalContent`：`setBlocksContent` 还原正文 + `invalidateBlockCache`（**首次与非首次都要**）
2. 删本次 `srs.c{N}.*`
3. 仅 `isFirstClozeCard`：`cleanupSrsProperties` + `removeTag card` + 删 `_repr`

### 工具函数

| 函数 | 说明 |
| ---- | ---- |
| `isClozeFragment` | **共用谓词**（导出）：精确匹配 `${pluginName}.cloze`，同时宽松匹配任意 `*.cloze` 后缀（兼容历史插件名如 `srs-plugin`）。生成侧与读取侧必须共用它——若生成侧只认新前缀，旧前缀 c1 存在时会重复分配编号 1，导致 cardKey / `srs.cN.*` 状态混叠 |
| `getMaxClozeNumberFromContent` | 当前最大编号（经 `isClozeFragment` 宽松判定，含旧前缀 fragment） |
| `getAllClozeNumbers` | 全部编号（去重排序；同样经 `isClozeFragment`） |
| `cloneBlockContent` | 挖空前 content 深拷贝（undo 用） |
| `unwrapClozeNumberInContent` | 纯函数：将指定 `clozeNumber` 的**全部** fragment 解包为 `{ t:"t", v }`；同号分组全解包；**不**合并相邻纯文本（与 `buildNewContent` 惯例一致）；挖空前加粗/链接等未保存在 `v` 中，无法恢复 |
| `unwrapClozeFragmentsByNumber` | 写库：`setBlocksContent` 解包后 `invalidateBlockCache`；失败抛错（含块 ID） |
| `createCloze` | 创建填空 |

### 删除变体（结构 + 进度）

入口：`deleteReviewCardBackendData`（Flash Home）。顺序：**先解包 content，再清 `srs.cN.*`**（防止收集复活）。同块仍有其它编号时保留 `#card`；最后一个编号则整卡清 `srs.*` + removeTag。IO 遮罩**不**走本路径。

回归：`clozeUtils.test.ts`（同号多 fragment）、`SrsFlashcardHome.delete.test.ts`。

---

## 编辑器渲染

- **Inline**：`ClozeInlineRenderer` — 浅灰文字 + 蓝色下划线，`data-cloze-number`，`title` 提示 Cloze N
- **注册**：`orca.renderers.registerInline(\`${pluginName}.cloze\`)`
- **Plain 转换器**：导出为 `{cN:: 内容}` 文本形式

---

## 收集与复习

### 收集（`cardCollector.collectReviewCards`）

当 `extractCardType(block) === "cloze"`：

1. `getAllClozeNumbers(block.content, pluginName)`
2. 无编号则跳过
3. 默认跳过 `srs.cN.suspended=true` 的编号；其它编号继续收集
4. 每个保留编号：`ensureClozeSrsState` → 一张 `ReviewCard`（含 `clozeNumber`、`content`）

Flash Home 的 include-suspended 路径会同时返回暂停编号并标记 `isSuspended`，用于逐编号恢复。旧整块暂停恢复某一 cN 时，其它当前存活编号会显式保留暂停。

### 复习 UI

| 组件 | 职责 |
| ---- | ---- |
| `ClozeCardReviewRenderer` | 复习外壳：显示答案/评分/只读回看 |
| `ClozeReviewBlockContent` | 复用 Orca 原生 `Block` 渲染，保留富文本 |
| `SrsCardDemo` | `cardType=cloze` 或 `_repr.type=srs.cloze-card` 时路由到 Cloze 渲染器 |

交互：

- **题目**：当前 `clozeNumber` 显示为 `[...]`（灰虚线框）；其它编号显示答案
- **答案**：当前填空高亮（蓝底/下划线）
- 根块若有子块：题目阶段隐藏 children，显示答案后展示（并尝试展开折叠）
- 评分：`updateClozeSrsState(blockId, clozeNumber, grade, pluginName)`

---

## 限制（当前代码）

- 不支持跨 fragment 选区
- 不支持 `{c1::答案::提示}` 提示语法
- 未实现「同编号填空组同时挖空」的独立产品特性（若 content 中存在相同 `clozeNumber`，共用同一状态）
- 与方向卡混用：方向插入时会检测并拒绝（见方向卡文档）

---

## 相关文件

| 路径 | 说明 |
| ---- | ---- |
| `src/srs/clozeUtils.ts` | 创建与编号工具 |
| `src/srs/clozeUtils.test.ts` | 单元测试 |
| `src/srs/incremental-reading/irClozeCommandService.ts` | 编辑器命令入口（含 extracts 分支） |
| `src/srs/storage.ts` | `loadClozeSrsState` / `writeInitialClozeSrsState` / `updateClozeSrsState` / `ensureClozeSrsState` |
| `src/srs/cardCollector.ts` | 按编号展开 ReviewCard |
| `src/srs/cardIdentity.ts` | `cloze:{id}:cN` |
| `src/srs/reviewCardGrading.ts` | 评分写回 cloze 状态 |
| `src/srs/registry/commands.ts` | `createCloze` |
| `src/srs/registry/uiComponents.tsx` | 工具栏 cloze 按钮 |
| `src/srs/registry/renderers.ts` / `converters.ts` | inline 渲染与 plain 转换 |
| `src/components/ClozeInlineRenderer.tsx` | 编辑器内 |
| `src/components/ClozeCardReviewRenderer.tsx` | 复习 |
| `src/components/ClozeReviewBlockContent.tsx` | 复习内容区 |
| `src/components/SrsCardDemo.tsx` | 类型路由 |
