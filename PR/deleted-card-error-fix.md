# PR2: 修复复习界面删除卡片导致的错误

## 问题描述

在复习界面中，如果用户删除了当前正在复习的题目块，会导致以下错误：

```
ORCA: Promise rejection: TypeError: Cannot read properties of undefined (reading 'children')
```

### 问题原因

当块被删除后，`orca.state.blocks[blockId]` 返回 `undefined`，但代码中多处直接访问 `block.children` 属性而没有进行空值检查，导致运行时错误。

受影响的场景：
- Basic 卡片（问答卡）
- Cloze 卡片（填空卡）
- Direction 卡片（方向卡）
- Choice 卡片（选择题卡）

## 修改内容

### 1. `src/srs/choiceUtils.ts`

**改动**：在 `extractChoiceOptions` 函数中添加 `block` 参数的空值检查

```typescript
// 修改前
export function extractChoiceOptions(block: Block): ChoiceOption[] {
  if (!block.children || block.children.length === 0) {
    return []
  }
  // ...
}

// 修改后
export function extractChoiceOptions(block: Block): ChoiceOption[] {
  if (!block || !block.children || block.children.length === 0) {
    return []
  }
  // ...
}
```

### 2. `src/components/SrsCardDemo.tsx`

**改动**：在渲染逻辑之前添加块不存在的检查

```tsx
// 新增代码（在 cloze/direction/choice 渲染器之前）
if (blockId && !questionBlock) {
  return (
    <div style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      textAlign: "center",
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗑️</div>
      <div style={{ fontSize: "16px", marginBottom: "8px" }}>该卡片已被删除</div>
      <div style={{ fontSize: "14px", opacity: 0.7 }}>请跳过此卡片继续复习</div>
      {onSkip && (
        <Button variant="outline" onClick={onSkip} style={{ marginTop: "16px" }}>
          跳过
        </Button>
      )}
    </div>
  )
}
```

### 3. `src/components/ClozeCardReviewRenderer.tsx`

**改动**：在渲染逻辑之前添加块不存在的检查

```tsx
// 新增代码（在 contentFragments 计算之前）
if (!block) {
  return (
    <div style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      textAlign: "center",
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗑️</div>
      <div style={{ fontSize: "16px", marginBottom: "8px" }}>该卡片已被删除</div>
      <div style={{ fontSize: "14px", opacity: 0.7 }}>请跳过此卡片继续复习</div>
      {onSkip && (
        <Button variant="outline" onClick={onSkip} style={{ marginTop: "16px" }}>
          跳过
        </Button>
      )}
    </div>
  )
}
```

### 4. `src/components/DirectionCardReviewRenderer.tsx`

**改动**：在渲染逻辑之前添加块不存在的检查

```tsx
// 新增代码（在 dirInfo 检查之前）
if (!block) {
  return (
    <div style={{
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      textAlign: "center",
      color: "var(--orca-color-text-2)"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗑️</div>
      <div style={{ fontSize: "16px", marginBottom: "8px" }}>该卡片已被删除</div>
      <div style={{ fontSize: "14px", opacity: 0.7 }}>请跳过此卡片继续复习</div>
      {onSkip && (
        <Button variant="outline" onClick={onSkip} style={{ marginTop: "16px" }}>
          跳过
        </Button>
      )}
    </div>
  )
}
```

## 用户体验改进

修复后，当用户在复习界面删除卡片时：

1. **不再报错**：不会出现 JavaScript 错误
2. **友好提示**：显示"该卡片已被删除"的提示界面
3. **可继续复习**：提供"跳过"按钮，用户可以继续复习下一张卡片

提示界面样式：
```
        🗑️
   该卡片已被删除
请跳过此卡片继续复习

      [跳过]
```

## 影响范围

- Basic 卡片（问答卡）
- Cloze 卡片（填空卡）
- Direction 卡片（方向卡）
- Choice 卡片（选择题卡）

## 测试建议

1. **Basic 卡片测试**
   - 开始复习 → 在另一个窗口删除当前卡片 → 验证显示"已删除"提示 → 点击跳过 → 验证可继续复习

2. **Cloze 卡片测试**
   - 开始复习填空卡 → 删除卡片 → 验证显示"已删除"提示

3. **Direction 卡片测试**
   - 开始复习方向卡 → 删除卡片 → 验证显示"已删除"提示

4. **Choice 卡片测试**
   - 开始复习选择题 → 删除卡片 → 验证不报错（选择题在 SrsCardDemo 层面已被拦截）

5. **边界情况测试**
   - 删除卡片后点击跳过 → 验证下一张卡片正常显示
   - 删除队列中最后一张卡片 → 验证正常进入"复习结束"界面

## 相关文件

- `src/srs/choiceUtils.ts`
- `src/components/SrsCardDemo.tsx`
- `src/components/ClozeCardReviewRenderer.tsx`
- `src/components/DirectionCardReviewRenderer.tsx`
