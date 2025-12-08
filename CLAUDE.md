# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 **Orca Note 插件** 项目,基于 Orca 笔记应用的插件系统开发。Orca Note 是一个块编辑器笔记应用,插件可以扩展其功能、添加自定义块类型、UI 组件和命令。

## 开发命令

```bash
# 开发模式 (启动 Vite 开发服务器)
npm run dev

# 构建生产版本 (编译并打包到 dist/)
npm run build

# 预览构建结果
npm run preview
```

## 项目架构

### 核心技术栈
- **TypeScript** - 主要开发语言,必须使用静态类型
- **React 18** - UI 组件库 (通过 `window.React` 全局访问,无需导入)
- **Valtio** - 状态管理库 (通过 `window.Valtio` 全局访问)
- **Vite** - 构建工具,使用 SWC 进行快速编译

### 构建配置
- 插件构建为 ES 模块格式 (`formats: ["es"]`)
- React 和 Valtio 标记为外部依赖 (由 Orca 应用提供)
- 使用 `rollup-plugin-external-globals` 映射全局变量

### 目录结构
```
├── src/
│   ├── main.ts              # 插件入口,包含 load/unload 函数
│   ├── orca.d.ts            # Orca API 类型定义 (5000+ 行完整 API)
│   ├── libs/l10n.ts         # 国际化工具
│   └── translations/zhCN.ts # 中文翻译
├── dist/                    # 编译输出目录 (必须包含 index.js)
├── plugin-docs/             # 完整的 Orca API 文档
│   ├── documents/           # API 文档
│   │   ├── Quick-Start.md
│   │   ├── Backend-API.md
│   │   ├── Core-Commands.md
│   │   ├── Core-Editor-Commands.md
│   │   └── Custom-Renderers.md
│   └── constants/           # 常量定义文档
├── icon.png                 # 插件图标 (必需)
├── vite.config.ts           # Vite 构建配置
└── package.json             # 项目配置
```

## 插件开发关键概念

### 1. 插件生命周期
```typescript
// 必须导出这两个函数
export async function load(pluginName: string) {
  // 插件启用时调用
  // - 注册命令、渲染器、转换器
  // - 设置事件监听
  // - 初始化插件状态
  // - 添加 UI 元素
}

export async function unload() {
  // 插件禁用时调用
  // - 移除所有注册的组件
  // - 清理事件监听
  // - 释放资源
}
```

### 2. 全局 API 访问
- `orca` - 主 API 对象 (全局可用)
- `orca.state` - 应用状态 (包含 blocks, panels, settings 等)
- `window.React` - React 库 (无需 import)
- `window.Valtio` - Valtio 状态库

### 3. 命名约定
- **避免下划线前缀** (`_`) - 系统保留
- **使用插件前缀** - 所有标识符加前缀 (如 `myplugin.commandName`)
- **唯一性** - 确保命令、渲染器名称全局唯一

## 核心 API 模式

### 命令系统
```typescript
// 注册普通命令
orca.commands.registerCommand(id, fn, label)

// 注册编辑器命令 (支持撤销/重做)
orca.commands.registerEditorCommand(id, doFn, undoFn, {label, hasArgs})

// 执行命令
await orca.commands.invokeCommand(id, ...args)
await orca.commands.invokeEditorCommand(id, cursor, ...args)
```

### 渲染系统
```typescript
// 注册块渲染器
orca.renderers.registerBlock(type, isEditable, Component, assetFields?, useChildren?)

// 注册内联内容渲染器
orca.renderers.registerInline(type, isEditable, Component)
```

### 转换系统
```typescript
// 注册块转换器 (用于导出)
orca.converters.registerBlock(format, type, convertFn)

// 注册内联转换器
orca.converters.registerInline(format, type, convertFn)
```

### UI 扩展
```typescript
// 工具栏按钮
orca.toolbar.registerToolbarButton(id, {icon, tooltip, command, menu?})

// 顶栏按钮
orca.headbar.registerHeadbarButton(id, renderFn)

// 斜杠命令
orca.slashCommands.registerSlashCommand(id, {icon, group, title, command})

// 块菜单命令
orca.blockMenuCommands.registerBlockMenuCommand(id, {worksOnMultipleBlocks, render})

// 标签菜单命令
orca.tagMenuCommands.registerTagMenuCommand(id, {render})

// 编辑器侧边工具
orca.editorSidetools.registerEditorSidetool(id, {render})
```

### 后端 API
```typescript
// 查询块
const block = await orca.invokeBackend("get-block", blockId)
const blocks = await orca.invokeBackend("get-blocks", [id1, id2])

// 搜索
const results = await orca.invokeBackend("search-blocks-by-text", keyword)

// 复杂查询
const results = await orca.invokeBackend("query", {q, sort, pageSize})

// 文件操作
await orca.invokeBackend("shell-open", url)
await orca.invokeBackend("show-in-folder", filePath)

// 资源上传
const path = await orca.invokeBackend("upload-asset-binary", mimeType, data)
```

### 数据存储
```typescript
// 插件数据持久化
await orca.plugins.setData(pluginName, key, value)
const value = await orca.plugins.getData(pluginName, key)
await orca.plugins.removeData(pluginName, key)
```

### 通知系统
```typescript
orca.notify(type, message, {title?, action?})
// type: "info" | "success" | "warn" | "error"
```

## React 组件开发

### 使用 Orca 内置组件
```typescript
const {Button, Menu, MenuText, Input, Select} = orca.components

// 所有可用组件见 orca.d.ts 的 components 部分
```

### 自定义块渲染器示例
```typescript
import type {Block, DbId} from "./orca.d.ts"

const {useRef, useMemo} = window.React
const {useSnapshot} = window.Valtio
const {BlockShell, BlockChildren} = orca.components

export default function CustomBlock({
  panelId, blockId, rndId, blockLevel, indentLevel,
  mirrorId, renderingMode, /* 自定义 props */
}) {
  const {blocks} = useSnapshot(orca.state)
  const block = blocks[mirrorId ?? blockId]

  const childrenJsx = useMemo(
    () => <BlockChildren block={block as Block} {...} />,
    [block?.children]
  )

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      reprClassName="custom-block"
      contentJsx={/* 自定义内容 */}
      childrenJsx={childrenJsx}
    />
  )
}
```

## 重要类型定义

### Block (块)
```typescript
interface Block {
  id: DbId                    // 块 ID
  content?: ContentFragment[] // 富文本内容
  text?: string              // 纯文本
  created: Date              // 创建时间
  modified: Date             // 修改时间
  parent?: DbId              // 父块
  children: DbId[]           // 子块列表
  aliases: string[]          // 别名
  properties: BlockProperty[] // 属性
  refs: BlockRef[]           // 引用
  backRefs: BlockRef[]       // 反向引用
}
```

### ContentFragment (内容片段)
```typescript
type ContentFragment = {
  t: string   // 类型 ("text", "code", "link" 等)
  v: any      // 值
  f?: string  // 格式化
  fa?: Record<string, any> // 格式化参数
}
```

### CursorData (光标位置)
```typescript
interface CursorData {
  anchor: CursorNodeData  // 起始位置
  focus: CursorNodeData   // 结束位置
  isForward: boolean      // 选择方向
  panelId: string         // 面板 ID
  rootBlockId: DbId       // 根块 ID
}
```

## 开发注意事项

1. **必须使用 TypeScript 静态类型** - 全局规则要求
2. **React/Valtio 使用全局变量** - 不要导入,直接使用 `window.React` 和 `window.Valtio`
3. **插件名称作为命名空间** - 所有注册项使用 `${pluginName}.xxx` 格式
4. **清理资源** - `unload()` 中必须移除所有注册的组件
5. **避免副作用** - 不要覆盖系统级命令和组件
6. **编辑器命令** - 使用 `invokeEditorCommand` 而非 `invokeCommand` 来操作块内容
7. **状态响应式** - 使用 Valtio 的 `useSnapshot` 监听状态变化

## 插件部署

1. 构建插件: `npm run build`
2. 确保存在:
   - `dist/index.js` (必需)
   - `icon.png` (必需)
3. 将插件文件夹复制到 `orca/plugins/` 目录
4. 在 Orca 应用中启用插件

## 文档资源

- **完整 API 参考**: `src/orca.d.ts` (5000+ 行带注释的类型定义)
- **快速开始**: `plugin-docs/documents/Quick-Start.md`
- **后端 API**: `plugin-docs/documents/Backend-API.md`
- **核心命令**: `plugin-docs/documents/Core-Commands.md`
- **编辑器命令**: `plugin-docs/documents/Core-Editor-Commands.md`
- **自定义渲染器**: `plugin-docs/documents/Custom-Renderers.md`

---
# 项目说明：Orca SRS 插件

## 1. 项目目标

- 我正在使用 Orca Note 和 orca-plugin-template 仓库开发一个插件。
- 插件目标：实现一个「基础 SRS 记忆系统」，支持：
  - 把块标记为“记忆卡片”
  - 基于简单的 SRS 算法安排复习时间
  - 提供前端复习界面（卡片正反面 + 评分按钮）

我本人 **不会写代码**，所以你（AI）在写代码时需要：
- 用清晰的中文注释解释关键逻辑；
- 在每次修改后，用自然语言说明「改了哪些文件、每个文件负责什么」。

## 2. 用户使用方式（产品视角）

### 2.1 标记卡片和 deck

用户规则：

1. 任何要变成记忆卡片的块：
   - 父块 = 题目
   - 第一个子块 = 答案
   - 父块打标签 `#card`
2. 可选 deck：
   - 在 Orca 标签页面为 `#card` 标签定义 "deck" 属性（类型：多选文本）
   - 添加可选值（如 "English"、"物理"、"数学"）
   - 给块打 `#card` 标签后，从下拉菜单选择 deck 值
   - 如果不选择，默认归入 "Default" deck

插件行为：

- 扫描所有打了 `#card` 的父块，把它们视为卡片。
- 从父块文本中取题目（front）。
- 从第一个子块内容中取答案（back）。
- 从 `block.refs[].data` 读取 deck 值（支持数组和字符串格式）。
- 为这些块设置 `_repr.type = "srs.card"`，由自定义渲染器显示卡片 UI。
- 使用块属性保存 SRS 状态（例如 `srs.isCard`, `srs.due`, `srs.interval`, `srs.ease`, `srs.reps`, `srs.lapses`）。

### 2.2 命令与入口

需要实现的命令和入口：

1. 命令 `SRS: Make Card From Current Block`
   - 将当前块 + 第一个子块变成一张卡片
   - 自动添加 `#card` 标签
   - 初始化 SRS 属性
   - 设置 `_repr.type = "srs.card"`

2. 命令 `SRS: Start Review`
   - 查找所有「今天到期」的卡片
   - 打开一个复习界面，一张一张显示
   - 卡片 UI 包含：
     - 题目 / 显示答案按钮
     - 答案区
     - 四个评分按钮：Again / Hard / Good / Easy

3. 工具栏按钮
   - 在编辑器顶部增加一个按钮，例如“Start SRS Review”，调用 `SRS: Start Review`。

4. Slash 命令
   - `/srs-card` ⇒ `SRS: Make Card From Current Block`
   - `/srs-review` ⇒ `SRS: Start Review`

## 3. 技术与架构约束

- 项目基于：https://github.com/sethyuan/orca-plugin-template
- 使用该模板自带的技术栈（由你来识别，一般是 TypeScript + 某个前端框架，例如 React）。
- 所有 UI 组件要遵循模板项目的习惯写法和文件结构。

插件开发约定：

1. 使用一个自定义 block 渲染器：
   - 类型：`"srs.card"`
   - 组件名：例如 `SrsCardBlockRenderer`
   - 行为：显示 front/back + 评分按钮

2. SRS 状态存储：
   - 使用 `core.editor.setProperties` 为每个卡片块设置属性，例如：
     - `srs.isCard: boolean`
     - `srs.due: DateTime`
     - `srs.interval: number`
     - `srs.ease: number`
     - `srs.reps: number`
     - `srs.lapses: number`

3. SRS 算法：
   - 抽象出一个纯函数，例如：
     - `nextReviewState(prevState, grade) -> newState`
   - grade 为 `"again" | "hard" | "good" | "easy"`
   - 算法可以基于简化 SM-2，但要在注释里用中文解释规则。
   - 放在独立文件中，例如：`src/srs/algorithm.ts`

4. 数据访问封装：
   - 与 Orca 后端 / 编辑器 API 的交互封装到模块，比如 `src/srs/storage.ts`：
     - `loadCardSrsState(blockId)`
     - `saveCardSrsState(blockId, newState)`
     - `queryDueCards(date)` 等

## 4. 对 AI 的工作方式要求

每次你（AI）修改代码时，请遵守：

1. **说明修改范围**
   - 列出所有修改过或新增的文件路径。
   - 对每个文件，介绍它负责什么。

2. **提供完整代码**
   - 对修改较大的文件，直接给出完整最终版本，而不是只给 diff。
   - 保证我可以复制粘贴覆盖。

3. **解释逻辑**
   - 用中文解释关键逻辑与数据流：
     - 卡片是如何从标签识别出来的
     - 复习界面如何选择下一张卡
     - SRS 算法如何更新属性

4. **给操作指引**
   - 告诉我在终端需要运行什么命令（如 `npm install`, `npm run dev`, `npm run build`）。
   - 告诉我在 Orca 里需要点击哪些地方才能看到你实现的功能。

5. **优先前端可见性**
   - 开发顺序应为：先让前端 UI（卡片 + 复习会话）跑起来（可用假数据），再逐步接入真实的 Orca 数据与 SRS 算法。

---

## 5. 当前实现概述（2025-12-08）

- **卡片识别**：父块打 `#card` 标签即视为题目，首个子块作为答案。`extractDeckName()` 从标签属性 `deck` 中读取分组，支持多选值数组或字符串，默认 `Default`。
- **自定义渲染器**：`SrsCardBlockRenderer` 负责编辑器内的卡片展示，保留“显示答案 + 评分”交互，并写入 `srs.*` 属性。
- **复习面板**：
  - `SrsReviewSessionRenderer` 在右侧创建专用面板并记录 `reviewHostPanelId`，子组件收到该 ID 后，复习界面内的 `<orca.components.Block>` 可以直接编辑原始块并即刻同步保存。
  - 会话队列由 `collectReviewCards()` 与 `buildReviewQueue()` 生成（两旧一新交织），评分调用 `updateSrsState()`（FSRS）并立刻跳至下一张。
- **SrsCardDemo 行为**：
  - “题目”区域渲染 `blockId` 对应的 Block，且使用 `renderingMode="simple"` + MutationObserver 隐藏所有子块，因此答案内容不会提前出现在正面区域。
  - “显示答案”后才渲染首个子块（答案 Block），同样可直接编辑并由 Orca 自动保存。
  - 若缺少 block 信息，则回退到传入的纯文本 front/back。
- **命令入口**：`SRS: startReviewSession`、`SRS: scanCardsFromTags`、`SRS: openCardBrowser`、`SRS: makeCardFromBlock` 及对应工具栏按钮/斜杠命令均已注册，可在 Orca 里直接触发。
- **构建与调试**：`npm run build` 产出 `dist/index.js`；开发阶段若需热更新可运行 `npm run dev` 并在 Orca 中加载未打包脚本。

> 若未来实现方式有改动，请同步更新本节，确保与真实行为一致。



