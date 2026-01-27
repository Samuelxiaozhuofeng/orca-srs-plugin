# AI 智能制卡优化方案

## 问题分析

### 原有实现的问题
1. **错误的架构**：`aiInteractiveCardCreatorSimple.ts` 试图通过创建"对话框块"（`_repr` 属性）来显示 UI，这不是 Orca 推荐的模态弹窗方式
2. **未使用现有组件**：已有完整的 `AICardGenerationDialog.tsx` 组件，但没有被正确集成
3. **缺少状态管理**：没有使用 Valtio 来管理弹窗的显示/隐藏状态

### 正确的实现方式
根据 Orca 插件开发最佳实践：
1. 使用 **Valtio** 创建全局响应式状态
2. 将弹窗组件挂载到 **Headbar**（作为"特洛伊木马"注入 React 树）
3. 通过**命令**触发状态变化来显示弹窗

---

## 新实现架构

### 文件结构
```
src/
├── srs/ai/
│   ├── aiDialogState.ts              # 新增：Valtio 状态管理
│   ├── aiInteractiveCardCreatorNew.ts # 新增：命令处理器
│   ├── aiKnowledgeExtractor.ts       # 已有：知识点提取
│   └── aiCardGenerators.ts           # 已有：卡片生成
├── components/
│   ├── AIDialogMount.tsx             # 新增：弹窗挂载组件
│   └── AICardGenerationDialog.tsx    # 已有：弹窗 UI 组件
└── srs/registry/
    ├── commands.ts                   # 修改：注册新命令
    └── uiComponents.tsx              # 修改：注册挂载组件
```

---

## 核心组件说明

### 1. aiDialogState.ts - 状态管理
```typescript
export const aiDialogState = proxy({
  isOpen: boolean,
  knowledgePoints: KnowledgePoint[],
  originalContent: string,
  sourceBlockId: number | null
})

export function openAIDialog(...)  // 打开弹窗
export function closeAIDialog()    // 关闭弹窗
```

**作用**：
- 使用 Valtio 创建响应式状态
- 控制弹窗的显示/隐藏
- 存储弹窗所需的数据（知识点、原始内容、源块 ID）

---

### 2. AIDialogMount.tsx - 弹窗挂载组件
```typescript
export function AIDialogMount({ pluginName }) {
  const snap = useSnapshot(aiDialogState)
  
  if (!snap.isOpen) return null
  
  return (
    <AICardGenerationDialog
      visible={snap.isOpen}
      onClose={closeAIDialog}
      knowledgePoints={snap.knowledgePoints}
      originalContent={snap.originalContent}
      onGenerate={handleGenerate}
    />
  )
}
```

**作用**：
- 订阅 Valtio 状态变化
- 当 `isOpen = true` 时渲染弹窗
- 处理卡片生成逻辑（调用 AI 服务 → 插入块）

**关键点**：
- 这个组件被注册到 Headbar，平时渲染为 `null`
- 利用 Orca 的 React 树，无需手动挂载 DOM

---

### 3. aiInteractiveCardCreatorNew.ts - 命令处理器
```typescript
export async function startInteractiveCardCreationNew(cursor, pluginName) {
  // 1. 验证光标和块
  // 2. 提取内容
  // 3. 调用 AI 分析知识点
  // 4. 打开弹窗
  openAIDialog(knowledgePoints, content, blockId)
}
```

**作用**：
- 处理用户触发的命令
- 调用 AI 服务提取知识点
- 打开弹窗（通过修改 Valtio 状态）

---

### 4. 注册流程

#### uiComponents.tsx
```typescript
export function registerUIComponents(pluginName: string) {
  // 注册弹窗挂载组件到 Headbar（特洛伊木马）
  orca.headbar.registerHeadbarButton(`${pluginName}.aiDialogMount`, () => (
    <AIDialogMount pluginName={pluginName} />
  ))
  
  // ... 其他 UI 组件
}
```

#### commands.ts
```typescript
orca.commands.registerEditorCommand(
  `${pluginName}.interactiveAICard`,
  async (editor) => {
    const { startInteractiveCardCreationNew } = await import("../ai/aiInteractiveCardCreatorNew")
    await startInteractiveCardCreationNew(cursor, pluginName)
  },
  // ...
)
```

---

## 用户交互流程

```
用户选择块 → 输入斜杠命令 "/AI 智能制卡"
    ↓
命令触发 startInteractiveCardCreationNew()
    ↓
AI 分析内容，提取知识点
    ↓
openAIDialog() 修改 Valtio 状态 (isOpen = true)
    ↓
AIDialogMount 组件检测到状态变化，渲染弹窗
    ↓
用户在弹窗中选择知识点、卡片类型
    ↓
点击"生成" → handleGenerate()
    ↓
调用 AI 生成卡片 → 插入到块下方
    ↓
closeAIDialog() 关闭弹窗
```

---

## 关键技术点

### 1. "特洛伊木马"模式
- **问题**：Orca 不暴露 `window.ReactDOM`，无法手动挂载组件
- **解决**：将组件注册到 Headbar，利用 Orca 的 React 树
- **优势**：
  - 无需手动管理 DOM
  - 自动适配 Orca 主题
  - 生命周期由 Orca 管理

### 2. Valtio 响应式状态
- **为什么用 Valtio**：Orca 官方推荐的状态管理方案
- **优势**：
  - 自动触发 React 重渲染
  - 简洁的 API（`proxy` + `useSnapshot`）
  - 无需手动订阅/取消订阅

### 3. ModalOverlay 组件
- **来源**：`orca.components.ModalOverlay`
- **功能**：
  - 自带背景遮罩
  - 点击遮罩自动关闭
  - 自动居中布局
  - 适配深色/浅色模式

---

## 与旧实现的对比

| 特性 | 旧实现 (Simple) | 新实现 (New) |
|------|----------------|--------------|
| 弹窗方式 | 创建"对话框块" | ModalOverlay |
| 状态管理 | 闭包变量 | Valtio |
| 组件挂载 | 尝试使用 ReactDOM | Headbar 注册 |
| 用户体验 | 块内显示，不直观 | 模态弹窗，专业 |
| 维护性 | 低（非标准方式） | 高（官方推荐） |

---

## 测试步骤

1. **启动插件**
   ```bash
   npm run dev
   ```

2. **触发命令**
   - 在块中输入内容（如："使役形（～させる）+ ない：不让/不准（某人）做某事"）
   - 输入 `/AI 智能制卡`

3. **验证弹窗**
   - 弹窗应该以模态形式出现
   - 显示 AI 提取的知识点
   - 可以选择/取消选择知识点
   - 可以输入自定义知识点
   - 可以选择卡片类型（Basic / Cloze）

4. **验证生成**
   - 点击"生成"按钮
   - 卡片应该插入到原始块下方
   - 弹窗自动关闭

---

## 注意事项

### 1. 依赖声明
确保 `package.json` 中声明了 peer dependencies：
```json
"peerDependencies": {
  "react": "^18.2.0",
  "valtio": "^1.13.2"
}
```

### 2. 类型安全
- 使用 `window.Valtio` 和 `window.React` 访问全局对象
- 避免直接导入 `react` 和 `valtio`（会导致多实例冲突）

### 3. 清理逻辑
- `closeAIDialog()` 延迟 300ms 清理数据，避免关闭动画期间数据消失

---

## 后续优化建议

1. **撤销支持**
   - 当前不支持批量撤销生成的卡片
   - 可以记录生成的块 ID，实现批量删除

2. **错误处理**
   - 增强 AI 服务失败时的重试机制
   - 提供更详细的错误提示

3. **性能优化**
   - 大量知识点时分批生成
   - 添加生成进度提示

4. **用户体验**
   - 支持键盘快捷键（Esc 关闭弹窗）
   - 记住用户上次选择的卡片类型

---

## 相关文件

- ✅ `/src/srs/ai/aiDialogState.ts` - 新增
- ✅ `/src/components/AIDialogMount.tsx` - 新增
- ✅ `/src/srs/ai/aiInteractiveCardCreatorNew.ts` - 新增
- ✅ `/src/srs/registry/commands.ts` - 已修改
- ✅ `/src/srs/registry/uiComponents.tsx` - 已修改
- 📄 `/src/components/AICardGenerationDialog.tsx` - 已有（无需修改）
- 📄 `/src/srs/ai/aiKnowledgeExtractor.ts` - 已有（无需修改）
- 📄 `/src/srs/ai/aiCardGenerators.ts` - 已有（无需修改）

---

## 总结

新实现完全遵循 Orca 插件开发最佳实践：
- ✅ 使用 Valtio 管理状态
- ✅ 使用 Headbar 注册组件
- ✅ 使用 ModalOverlay 显示弹窗
- ✅ 无需手动操作 DOM
- ✅ 自动适配 Orca 主题
- ✅ 类型安全

用户体验显著提升：
- ✅ 专业的模态弹窗
- ✅ 清晰的知识点选择界面
- ✅ 实时预览生成数量
- ✅ 流畅的交互动画
