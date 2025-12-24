# 折叠句柄悬浮行为修复说明

## 问题描述

之前当鼠标悬浮到答案区域时，所有答案块的折叠句柄都会同时显示，而不是只显示当前悬浮块的句柄。

## 根本原因

问题出在答案块的渲染结构上：
- 每个 AnswerBlock 组件外部有额外的包装 `<div style="margin-bottom: 8px">`
- 这些包装 div 导致所有答案块共享同一个悬浮状态
- Orca 的折叠句柄悬浮检测逻辑被这些包装元素干扰

## 解决方案

### 1. 移除外部包装 div

**之前的代码：**
```tsx
{answerBlockIds.map((aBlockId, index) => (
  <div style={{ marginBottom: "8px" }}>  {/* 问题：额外的包装 */}
    <AnswerBlock
      blockId={aBlockId}
      panelId={panelId}
      fallback={back}
    />
  </div>
))}
```

**修复后的代码：**
```tsx
{answerBlockIds.map((aBlockId, index) => (
  <AnswerBlock
    key={aBlockId}
    blockId={aBlockId}
    panelId={panelId}
    fallback={back}
    marginBottom={index < answerBlockIds.length - 1 ? "8px" : "0"}
  />
))}
```

### 2. 将 marginBottom 移到 AnswerBlock 内部

在 AnswerBlock 组件中添加 `marginBottom` prop，并直接应用到组件的容器 div 上：

```tsx
type AnswerBlockProps = {
  blockId?: DbId
  panelId?: string
  fallback: string
  marginBottom?: string  // 新增
}

function AnswerBlock({ blockId, panelId, fallback, marginBottom = "0" }: AnswerBlockProps) {
  return (
    <div
      ref={containerRef}
      style={{
        marginBottom,  // 直接应用 margin
      }}
    >
      <Block ... />
    </div>
  )
}
```

### 3. 移除干扰的 CSS 规则

确保没有全局的 `pointer-events: auto !important` 规则干扰 Orca 的悬浮检测。

### 4. 清理诊断代码

移除了所有 console.log 诊断语句，保持代码简洁。

## 测试方法

### 方法 1：手动测试

1. 打开一个包含多个答案块的 SRS 卡片
2. 点击"显示答案"按钮
3. 将鼠标悬浮到不同的答案块上
4. **预期行为**：只有当前悬浮的块显示折叠句柄
5. **错误行为**：所有答案块的折叠句柄同时显示

### 方法 2：使用诊断脚本

在浏览器控制台运行 `src/test/diagnose-folding-handles.js` 脚本：

```javascript
// 复制 diagnose-folding-handles.js 的内容到控制台
// 然后悬浮到不同的答案块上
// 查看控制台输出，检查 visibleHandles 数量
```

脚本会输出：
- 每个答案块的结构信息
- 是否有额外的包装元素
- 悬浮时可见的折叠句柄数量
- 如果检测到多个句柄同时显示，会发出警告

## 验证要点

✅ **正确行为：**
- 悬浮到某个答案块时，只有该块的折叠句柄显示
- 移开鼠标后，折叠句柄隐藏
- 每个答案块独立响应悬浮事件

❌ **错误行为：**
- 悬浮到任何答案块时，所有答案块的折叠句柄都显示
- 折叠句柄的显示/隐藏不跟随鼠标位置

## 相关文件

- `src/components/SrsCardDemo.tsx` - 主要修复文件
- `src/styles/srs-review.css` - CSS 样式文件
- `src/test/diagnose-folding-handles.js` - 诊断脚本

## 技术细节

### Orca 折叠句柄的工作原理

Orca 的折叠句柄使用 CSS `:hover` 伪类来控制显示/隐藏：

```css
.orca-block:hover > .orca-repr > ... > .orca-block-folding-handle {
  display: block;
}
```

当有额外的包装 div 时，`:hover` 状态会传播到所有同级元素，导致所有句柄同时显示。

### 为什么需要保留 AnswerBlock 内部的 div

AnswerBlock 内部仍然需要一个 div 容器，原因：
1. 需要 `ref` 来访问 DOM 元素
2. 需要应用 `marginBottom` 样式
3. Orca 的 Block 组件不接受 style prop

关键是**不要在 AnswerBlock 组件外部添加额外的包装元素**。

## 后续改进建议

1. 考虑为 QuestionBlock 也添加类似的优化
2. 监控性能，确保没有引入新的渲染问题
3. 如果发现其他悬浮相关的问题，检查是否有类似的包装元素干扰
