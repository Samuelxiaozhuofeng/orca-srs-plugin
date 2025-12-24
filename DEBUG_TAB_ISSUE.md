# Tab 键光标跳转问题调试指南

## 问题描述
在复习界面的答案区域（`class="srs-card-back"`）编辑 block 时，用户按 Tab 键（尤其是 Shift+Tab）进行缩进操作会导致光标跳转到其他 block。

## 问题根源分析（2025-12-24 更新）

通过调试日志发现：
1. **事件传播路径问题**：Tab 键事件在 Orca Block 组件内部就被处理，没有冒泡到我们的容器
2. **原有方案失效**：在 `AnswerBlock` 容器上添加的事件监听器完全没有被触发
3. **defaultPrevented: false**：说明在 Orca Block 内部，Tab 键事件没有被阻止

## 解决方案（最新）

### 采用全局捕获策略
在 `SrsCardDemo` 组件挂载时，在**全局捕获阶段**（Document 级别）拦截 Tab 键事件：

1. **检测事件目标**：通过向上遍历 DOM 树，检测事件是否发生在答案区域或题目区域
2. **立即阻止传播**：使用 `e.stopImmediatePropagation()` 阻止所有后续监听器
3. **优先级最高**：捕获阶段确保在 Orca Block 的事件处理器之前执行

### 关键代码逻辑
```javascript
// 在全局捕获阶段监听
document.addEventListener('keydown', handleGlobalKeyDown, true)

// 检测是否在复习区域
let element = target
while (element && element !== document.body) {
  if (element.classList.contains('srs-card-back') ||
      element.classList.contains('srs-answer-block') ||
      element.classList.contains('srs-card-front') ||
      element.classList.contains('srs-question-block')) {
    // 找到复习区域，阻止 Tab 键
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    return false
  }
  element = element.parentElement
}
```

## 已添加的调试信息

### 全局监控（SrsCardDemo 组件）
**控制台输出标识**：
- `[SrsCardDemo] 🌍 全局 Tab 键检测` - Tab 键事件检测
- `[SrsCardDemo] 🛡️ 在复习区域内阻止 Tab 键` - Tab 键被成功阻止（带区域标识）
- `[SrsCardDemo] 🌍 全局焦点变化` - 焦点切换事件

### 答案区域监控（AnswerBlock 组件）
**控制台输出标识**：
- `[AnswerBlock] 键盘事件捕获` - React 合成事件
- `[AnswerBlock] 🔍 全局捕获 Tab 键（捕获阶段）` - 原生事件捕获阶段
- `[AnswerBlock] 🔍 全局监听 Tab 键（冒泡阶段）` - 原生事件冒泡阶段
- `[AnswerBlock] ⛔ 阻止了 Tab 键操作` - 容器级别阻止（可能不会触发）
- `[AnswerBlock] 焦点进入/离开` - 焦点进出答案区域

### 题目区域监控（QuestionBlock 组件）
**控制台输出标识**：
- `[QuestionBlock] 键盘事件捕获` - 键盘事件
- `[QuestionBlock] ⛔ 阻止了 Tab 键操作` - 容器级别阻止（可能不会触发）

## 测试步骤

1. **打开虎鲸笔记并启用插件**
   ```bash
   # 重新加载最新构建
   npm run build
   ```

2. **打开浏览器开发者工具**
   - 按 F12 打开开发者工具
   - 切换到 "Console"（控制台）标签页
   - 启用 "Preserve log"（保留日志）选项

3. **开始复习会话**
   - 打开一张有答案的记忆卡片
   - 点击"显示答案"按钮

4. **测试 Tab 键**
   - 将光标放在答案区域的某个 block 中
   - 按 Tab 键（测试向后缩进）
   - 按 Shift+Tab（测试向前缩进）

5. **观察控制台输出**

   **成功阻止的情况：**
   ```
   [SrsCardDemo] 🌍 全局 Tab 键检测: { ... defaultPrevented: false }
   [SrsCardDemo] 🛡️ 在复习区域内阻止 Tab 键: { area: "答案区域", shiftKey: true, ... }
   ```

   **如果仍然跳转：**
   ```
   [SrsCardDemo] 🌍 全局 Tab 键检测: { ... defaultPrevented: false }
   [SrsCardDemo] 🌍 全局焦点变化: { activeBlockId: "663", ... }  // 焦点跳到其他 block
   ```
   （说明可能有更高优先级的监听器）

## 预期行为

- ✅ 按 Tab 或 Shift+Tab 时，光标**不应该**跳转到其他 block
- ✅ 控制台应该显示 `🛡️ 在复习区域内阻止 Tab 键`
- ✅ 用户可以正常使用 Enter 键创建新 block
- ✅ 其他编辑操作（输入文字、删除等）不受影响

## 已知限制

1. **禁用了缩进功能**：在复习界面的题目和答案区域，Tab 键完全被禁用
2. **不影响评分按钮**：Tab 键可以在评分按钮之间切换（因为不在检测范围内）

## 如果问题仍然存在

### 方案 A：检查事件传播链
查看是否有其他更高优先级的全局监听器：
```javascript
// 在控制台运行
getEventListeners(document)
```

### 方案 B：使用更激进的策略
完全禁用复习界面的所有 Tab 键：
```javascript
// 不检测区域，直接阻止
if (e.key === 'Tab' && blockId) {
  e.preventDefault()
  // ...
}
```

### 方案 C：CSS 方案
尝试使用 CSS 禁用焦点移动：
```css
.srs-card-back [contenteditable],
.srs-answer-block [contenteditable] {
  /* 实验性 */
  -moz-user-modify: read-write-plaintext-only;
}
```

---

**调试版本**：2025-12-24 (v2 - 全局捕获策略)
**相关文件**：`src/components/SrsCardDemo.tsx`
**构建状态**：✅ 成功 (dist/index.js: 415.68 kB)

