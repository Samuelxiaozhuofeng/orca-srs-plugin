# SRS 填空卡（Cloze）功能模块

> **本文档说明**：这是一个渐进式总结的文档，记录填空卡功能的实现过程。我们将一步一步地实现类似于 Anki 的 Cloze（填空）卡片功能。

---

## 📋 目标

实现类似 Anki 的 Cloze 填空卡功能，允许用户：

1. 选中文本后，将其转换为 `{c1:: 文本}` 格式的填空标记
2. 支持多次填空，自动递增编号（c1, c2, c3...）
3. 支持撤销/重做操作
4. 在复习时显示填空卡片，隐藏填空部分

---

## 📝 当前进度

### ✅ 阶段 1：基础填空标记功能（已完成）

#### 实现内容

1. **创建 clozeUtils 工具模块** (`src/srs/clozeUtils.ts`)

   - `getMaxClozeNumber(text)`: 从文本中提取当前最大的 cloze 编号
   - `createCloze(cursor, pluginName)`: 将选中文本转换为 cloze 格式

2. **注册编辑器命令** (`src/main.ts`)

   - 命令 ID: `${pluginName}.createCloze`
   - 支持 do/undo 操作
   - do: 调用 `createCloze()` 将选中文本转换为 `{cN:: text}` 格式
   - undo: 恢复原始文本和 content 数组

3. **注册工具栏按钮**
   - 按钮 ID: `${pluginName}.clozeButton`
   - 图标: `ti ti-braces` (大括号)
   - 提示: "创建 Cloze 填空"

---

### ✅ 阶段 1.5：Cloze Inline 渲染器（已完成）

#### 实现内容

1. **创建 Cloze Inline 渲染器组件** (`src/components/ClozeInlineRenderer.tsx`)

   - 组件名: `ClozeInlineRenderer`
   - 接收 props: `blockId`, `data`, `index`
   - data 格式: `{ t: "pluginName.cloze", v: "填空内容", clozeNumber: 1 }`

2. **注册 Inline 渲染器和转换器** (`src/main.ts`)

   - **Inline 渲染器**: `orca.renderers.registerInline()`
     - 类型: `${pluginName}.cloze`
     - 不可编辑 (`isEditable: false`)
   - **Plain 转换器**: `orca.converters.registerInline()`
     - 将 cloze inline 转换回 `{cN:: 内容}` 格式

3. **createCloze 函数**（2025-12-11 重构）
   - 直接操作 `block.content` 数组，根据 `cursor.anchor.index/offset` 定位
   - 拆分 fragment 并在中间插入 cloze fragment
   - 通过 `setBlocksContent` 更新块内容
   - Orca 自动调用 inline 渲染器显示填空

#### 渲染效果

- **填空内容**：只显示填空内容本身
- **浅灰色文本**：`color: #999`
- **蓝色下划线**：`border-bottom: 2px solid #4a90e2`
- **鼠标悬停提示**：显示 `Cloze N`

#### 技术原理

1. **ContentFragment 结构**

```typescript
// 普通文本
{ t: "t", v: "中国的首都是" }

// Cloze 填空
{
  t: "pluginName.cloze",
  v: "北京",
  clozeNumber: 1
}
```

2. **数据流程**（2025-12-11 重构）
   - 用户选中文本 → 点击 Cloze 按钮
   - `createCloze()` 根据 `cursor.anchor.index/offset` 定位到 fragment
   - 拆分该 fragment，在中间插入 cloze fragment
   - 使用 `setBlocksContent` 更新 `block.content` 数组
   - Orca 识别到 `pluginName.cloze` 类型，调用 `ClozeInlineRenderer`
   - 渲染器只显示填空内容，应用自定义样式

#### 使用效果

**操作前**：

```
中国的首都是北京
```

**选中"北京"点击 Cloze 按钮后**：

```
中国的首都是北京  （"北京"显示为浅灰色 + 蓝色下划线，{c1::} 符号不可见）
```

#### 核心逻辑

```typescript
// 检测最大 cloze 编号
const maxClozeNumber = getMaxClozeNumber(blockText);
const nextClozeNumber = maxClozeNumber + 1;

// 创建 cloze 标记
const clozeText = `{c${nextClozeNumber}:: ${selectedText}}`;

// 替换选中文本
const newBlockText =
  blockText.substring(0, startOffset) +
  clozeText +
  blockText.substring(endOffset);
```

#### 使用方式

1. 在块中输入文本，例如：`中国首都是北京`
2. 选中 "北京"
3. 点击工具栏的"创建 Cloze 填空"按钮（或使用命令）
4. 文本变为：`中国首都是{c1:: 北京}` **并自动添加 `#card` 标签**
5. 再次选中 "中国"，使用同样操作
6. 文本变为：`{c2:: 中国}首都是{c1:: 北京}` **（已有 `#card` 标签，不会重复添加）**

> 💡 **提示**：创建 cloze 填空会自动将块标记为卡片，无需手动添加 `#card` 标签。

#### 技术细节

> [!IMPORTANT] > **2025-12-11 重构**：使用虎鲸笔记原生 ContentFragment 机制替代 Anki 风格的 `{c1::}` 文本标记方式，解决样式冲突问题。

1. **原生 Fragment 机制（2025-12-11 重构）**

   **原有问题**：当文本有样式（加粗、斜体等）时，使用填空功能会导致挖空位置错位，因为 `block.text` 是纯文本，与 `cursor.offset` 不匹配。

   **新方案**：使用 `deleteSelection` + `insertFragments` 原生命令：

   ```typescript
   // 步骤 1：删除选中内容
   await orca.commands.invokeEditorCommand(
     "core.editor.deleteSelection",
     cursor
   );

   // 步骤 2：插入 cloze fragment
   const clozeFragment = {
     t: `${pluginName}.cloze`,
     v: selectedText,
     clozeNumber: nextClozeNumber,
   };
   await orca.commands.invokeEditorCommand(
     "core.editor.insertFragments",
     null,
     [clozeFragment]
   );
   ```

   **优势**：

   - ✅ 完美兼容加粗、斜体、颜色等样式
   - ✅ 撤销操作由框架自动处理
   - ✅ 与虎鲸笔记原生机制完美融合

2. **编号递增逻辑**

   - 从 `block.content` 中检测现有 cloze fragment 的最大编号
   - 新标记使用 `maxNumber + 1`

3. **#card 标签自动添加与类型标记**

   - 创建 cloze 标记后，自动检查块是否有 `#card` 标签
   - 检查逻辑：`block.refs?.some(ref => ref.type === 2 && ref.alias === "card")`
   - 如果没有标签，使用 `core.editor.insertTag` 命令自动添加，并设置 `type` 属性为 `cloze`
   - 如果标签已存在，使用 `core.editor.setRefData` 命令更新 `type` 属性为 `cloze`
   - 这样可以将填空卡标记为 "cloze" 类型，便于后续区分普通卡片和填空卡
   - 避免重复添加，确保每个块只有一个 `#card` 标签

4. **持久化标记（2025-12-10 新增）**

   - 设置 `srs.isCard` 属性（持久化到数据库）：
     ```typescript
     await orca.commands.invokeEditorCommand(
       "core.editor.setProperties",
       null,
       [blockId],
       [{ name: "srs.isCard", value: true, type: 4 }]
     );
     ```
   - **为什么需要**：`_repr` 属性不会持久化，重启 Orca 后会丢失
   - **解决方案**：使用块属性 `srs.isCard` 作为持久化标记
   - `collectReviewCards()` 通过 `block.properties` 检查此属性来识别填空卡

5. **分天推送机制（2025-12-10 新增）**

   - 多个填空自动设置不同的到期日期：
     - c1 → 今天到期（offset = 0 天）
     - c2 → 明天到期（offset = 1 天）
     - c3 → 后天到期（offset = 2 天）
   - 实现代码：
     ```typescript
     for (let i = 0; i < clozeNumbers.length; i++) {
       const clozeNumber = clozeNumbers[i];
       const daysOffset = clozeNumber - 1; // c1=0天, c2=1天, c3=2天...
       await writeInitialClozeSrsState(blockId, clozeNumber, daysOffset);
     }
     ```
   - **效果**：避免同一块的多个填空在同一天全部出现，分散学习负担

6. **错误处理**
   - 验证光标位置有效性
   - 检查是否有选中文本
   - 确保选中范围在同一块内
   - 捕获更新命令的异常
   - 标签添加/属性更新失败不影响 cloze 创建（容错处理）
   - 所有操作都有详细的日志记录

---

## 🔄 下一步计划

### ✅ 阶段 2：Cloze 卡片复习渲染（已完成）

**目标**：在复习界面正确渲染填空卡片，支持隐藏/显示答案

**实现内容**：

1. ✅ **编辑器内渲染** - 已完成（阶段 1.5）

   - 在编辑器中隐藏 `{cN::}` 符号
   - 显示浅灰色 + 蓝色下划线样式

2. ✅ **复习界面渲染** - 已完成（阶段 2）

   - 创建了 `ClozeCardReviewRenderer` 组件 (`src/components/ClozeCardReviewRenderer.tsx`)
   - 题目状态：将填空部分替换为 `[...]`（灰色虚线边框）
   - 答案状态：显示完整内容，高亮填空部分（蓝色背景 + 深蓝色文字）
   - 支持多个填空同时显示/隐藏

3. ✅ **卡片类型路由** - 已完成
   - 在 `SrsCardDemo` 中集成卡片类型识别
   - 通过 `block._repr.type` 判断卡片类型
   - `srs.cloze-card` 类型自动路由到 `ClozeCardReviewRenderer`
   - `srs.card` 类型使用原有的正面/反面渲染逻辑

**示例效果**：

```
题目（隐藏状态）：
中国的首都是 [...] ，最大的城市是 [...]

答案（显示状态）：
中国的首都是 北京 ，最大的城市是 上海
            ↑                 ↑
         高亮显示          高亮显示
```

**技术实现**：

1. **`ClozeCardReviewRenderer` 组件**

   - 接收 `blockId` 和 `pluginName` 参数
   - 从 `block.content` 读取 ContentFragment 数组
   - 使用 `renderFragments()` 函数渲染内容：
     - 普通文本片段（`t: "t"`）：直接显示
     - Cloze 片段（`t: "pluginName.cloze"`）：
       - 隐藏时：显示 `[...]`（灰色虚线边框）
       - 显示时：高亮显示（蓝色背景 + 下划线）

2. **`SrsCardDemo` 组件改进**

   - 新增 `pluginName` 属性
   - 在渲染前检查 `block._repr.type`
   - 如果是 `srs.cloze-card`，直接返回 `<ClozeCardReviewRenderer>`
   - 否则使用原有的正面/反面渲染逻辑

3. **插件名称传递**
   - 在 `main.ts` 中导出 `getPluginName()` 函数
   - `SrsReviewSessionRenderer` 加载时获取插件名称
   - 将插件名称传递给 `SrsReviewSessionDemo` → `SrsCardDemo` → `ClozeCardReviewRenderer`

**视觉设计**：

- **卡片类型标识**：顶部显示"填空卡"标签（蓝色图标 + 文字）
- **题目状态**：
  - `[...]` 占位符：灰色文字，虚线边框，浅色背景
- **答案状态**：
  - 高亮填空：浅蓝色背景，深蓝色文字，粗体，蓝色下划线

---

### ⏳ 阶段 3：多填空独立复习（待实现）

**目标**：支持同一卡片的多个填空分别复习

**任务**：

1. 为每个 cloze 编号生成独立的复习项
2. 复习时只显示当前 cloze 编号对应的 `[...]`，其他填空显示答案
3. 将带有 cloze 标记的块转换为 cloze 卡片
4. 注册 cloze 卡片的渲染器和转换器

---

### ⏳ 阶段 4：高级功能（待实现）

**任务**：

1. **提示文本**：支持 `{c1::答案::提示}` 格式
2. **填空组**：支持 `{c1::文本1} ... {c1::文本2}` 同时显示
3. **嵌套填空**：处理复杂的填空嵌套场景
4. **批量操作**：快速创建多个填空

---

## 📚 相关文件

### 核心实现

- `src/srs/clozeUtils.ts` - Cloze 工具函数
  - `getMaxClozeNumberFromContent()` - 从 ContentFragment 数组获取最大 cloze 编号
  - `getAllClozeNumbers()` - 获取所有 cloze 编号
  - `createCloze()` - 创建 cloze 填空（直接操作 ContentFragment 数组）
- `src/components/ClozeInlineRenderer.tsx` - Cloze Inline 渲染器（编辑器内）
- `src/components/ClozeCardReviewRenderer.tsx` - Cloze 卡片复习渲染器（复习界面）
- `src/components/SrsCardDemo.tsx` - 卡片复习组件（集成卡片类型路由）
- `src/components/SrsReviewSessionDemo.tsx` - 复习会话组件
- `src/components/SrsReviewSessionRenderer.tsx` - 复习会话块渲染器
- `src/main.ts` - 命令、按钮、渲染器注册

### 参考文档

- `SRS_卡片创建与管理.md` - 卡片创建流程
- `SRS_块渲染器.md` - 自定义渲染器实现
- `SRS_复习队列管理.md` - 复习队列构建逻辑

---

## 🎯 设计原则

1. **渐进增强**：每个阶段独立可用，逐步完善功能
2. **兼容现有系统**：与现有 SRS 卡片系统无缝集成
3. **用户体验优先**：操作简单直观，符合 Anki 用户习惯
4. **支持撤销**：所有操作都可撤销/重做
5. **类型安全**：使用 TypeScript 类型系统确保代码质量

---

## 📖 参考资料

- [Anki Manual - Cloze Deletion](https://docs.ankiweb.net/editing.html#cloze-deletion)
- `plugin-docs/documents/Core-Editor-Commands.md` - 虎鲸笔记编辑器命令文档
- `src/orca.d.ts` - 虎鲸笔记 API 类型定义

---

## 📊 实现总结

### 已完成功能

- ✅ **基础填空标记**：选中文本 → 转换为 `{cN:: 文本}` 格式
- ✅ **编号自动递增**：智能检测现有编号，避免冲突
- ✅ **自动添加标签**：首次创建填空时自动添加 `#card` 标签
- ✅ **卡片类型标记**：自动设置 `#card` 标签的 `type` 属性为 `cloze`，便于区分填空卡和普通卡片
- ✅ **Inline 渲染器**：编辑器内隐藏 `{cN::}` 符号，显示自定义样式
- ✅ **ContentFragment 解析**：将纯文本转换为富文本结构
- ✅ **撤销/重做支持**：完整的 undo/redo 功能
- ✅ **Plain 转换器**：支持导出为纯文本格式

### 新增功能（2025-12-10）

#### 阶段 1 & 1.5（已完成）

- ✅ **类型识别与扫描**：扫描功能自动识别 `type=cloze` 的卡片，设置为 `srs.cloze-card` 类型
- ✅ **独立卡片类型**：定义了 `srs.cloze-card` 类型，与普通卡片 `srs.card` 区分
- ✅ **自动类型设置**：创建 cloze 时自动设置标签属性 `type=cloze`
- ✅ **复习队列集成**：填空卡已集成到 SRS 复习系统，可正常复习
- ✅ **编辑器内渲染**：`ClozeInlineRenderer` 隐藏 `{cN::}` 符号，显示蓝色下划线样式

#### 阶段 2（2025-12-10 新增）

- ✅ **复习界面渲染**：创建 `ClozeCardReviewRenderer` 组件，实现填空卡专用复习界面
- ✅ **填空隐藏/显示**：题目状态显示 `[...]`，答案状态高亮显示填空内容
- ✅ **卡片类型路由**：`SrsCardDemo` 根据 `_repr.type` 自动选择渲染器
- ✅ **插件名称传递**：通过 `getPluginName()` 函数向下传递插件名称
- ✅ **多填空同时显示**：支持一个卡片内多个填空同时隐藏/显示

### 当前限制

- ⚠️ **多填空独立复习**：未实现同一卡片多个填空的分别复习（计划在阶段 3）
- ⚠️ **提示文本**：暂不支持 `{c1::答案::提示}` 格式（计划在阶段 4）

### 技术亮点

1. **符合 Orca 插件规范**：使用官方的 inline renderer API
2. **类型安全**：TypeScript 静态类型检查
3. **渐进增强**：每个阶段独立可用
4. **用户体验优先**：操作简单，符合 Anki 用户习惯

---

**最后更新**: 2025-12-10
**当前阶段**: 阶段 2 ✅ 完成（复习界面填空渲染）
**下一步**: 阶段 3 - 实现多填空独立复习功能
