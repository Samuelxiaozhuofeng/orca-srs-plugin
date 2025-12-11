SRS 复习界面 UI 优化计划
优化目标
默认面板宽度设为 50% - 用户打开复习界面时无需手动调整，自动 50/50 分割
复习界面完全平铺面板 - 去除 Block 组件的 bullet point、缩进等限制，占满整个面板空间
核心修改
修改 1：调整面板默认宽度为 50/50
文件：src/srs/panelUtils.ts 修改位置：第 73-74 行的宽度计算逻辑 当前实现：
const leftWidth = Math.max(700, Math.floor(totalWidth _ 0.6)) // 左 60%
const rightWidth = Math.max(360, totalWidth - leftWidth) // 右 40%
优化为：
const halfWidth = Math.floor(totalWidth _ 0.5)
const leftWidth = Math.max(600, Math.min(1200, halfWidth)) // 左 50%，最小 600px，最大 1200px
const rightWidth = Math.max(600, totalWidth - leftWidth) // 右 50%，最小 600px
效果：
1920px 显示器：左右各 960px
2560px 显示器：左 1200px（达到上限），右 1360px
保证复习界面有足够宽度显示卡片内容
修改 2：注入 CSS 样式隐藏 Block 组件的编辑器 UI
文件：src/components/SrsCardDemo.tsx 修改位置：在 ReviewBlock 组件内添加 useEffect 钩子（第 40 行附近） 新增代码：
// 注入全局样式，隐藏 Block 组件的编辑器 UI 元素
useEffect(() => {
const styleId = 'srs-review-block-styles'

if (!document.getElementById(styleId)) {
const style = document.createElement('style')
style.id = styleId
style.textContent = `
/_ 隐藏 bullet point、块手柄、拖拽手柄等 _/
.srs-block-container .orca-block-handle,
.srs-block-container .orca-block-bullet,
.srs-block-container .orca-block-drag-handle,
.srs-block-container .orca-repr-handle,
.srs-block-container .orca-repr-collapse,
.srs-block-container [class*="handle"],
.srs-block-container [class*="bullet"],
.srs-block-container [data-role="handle"],
.srs-block-container [data-role="bullet"] {
display: none !important;
visibility: hidden !important;
width: 0 !important;
height: 0 !important;
}

      /* 移除缩进和间距 */
      .srs-block-container .orca-block,
      .srs-block-container .orca-repr-main {
        padding-left: 0 !important;
        margin-left: 0 !important;
      }

      /* 隐藏子块（仅在题目区域） */
      .srs-block-hide-children [class*="children"],
      .srs-block-hide-children [data-role*="children"],
      .srs-block-hide-children [data-testid*="children"] {
        display: none !important;
        visibility: hidden !important;
      }
    `
    document.head.appendChild(style)

}

return () => {
const style = document.getElementById(styleId)
if (style && !document.querySelector('.srs-card-container')) {
style.remove()
}
}
}, [])
效果：
题目和答案区域无 bullet point
无块手柄、拖拽手柄、折叠按钮
无多余缩进
编辑功能保持正常
修改 3：增强 MutationObserver 的隐藏范围
文件：src/components/SrsCardDemo.tsx 修改位置：hideDescendants 函数（第 44-56 行） 当前选择器：
"[class*='children'], [data-role*='children'], [data-testid*='children']"
扩展为：
`[class*='children'],
 [data-role*='children'],
 [data-testid*='children'],
 [class*='handle'],
 [class*='bullet'],
 [class*='collapse'],
 [data-role='handle'],
 [data-role='bullet'],
 .orca-block-handle,
 .orca-block-bullet,
 .orca-repr-handle,
 .orca-block-drag-handle,
 .orca-repr-collapse`
并为 handle/bullet 元素强制设置尺寸为 0：
if (node.classList.contains('orca-block-handle') ||
node.classList.contains('orca-block-bullet') ||
node.classList.contains('orca-repr-handle')) {
node.style.width = "0"
node.style.height = "0"
node.style.overflow = "hidden"
}
修改 4：增强最大化模式的元素隐藏
文件：src/components/SrsReviewSessionDemo.tsx 修改位置：第 68 行 if (isMaximized)块内 新增代码（在现有隐藏逻辑之后）：
// 批量隐藏块手柄、bullet、拖拽手柄
const blockHandles = blockEditor.querySelectorAll('.orca-block-handle, .orca-repr-handle')
blockHandles.forEach((el: Element) => {
(el as HTMLElement).style.display = 'none'
})

const bullets = blockEditor.querySelectorAll('.orca-block-bullet, [data-role="bullet"]')
bullets.forEach((el: Element) => {
(el as HTMLElement).style.display = 'none'
})

const dragHandles = blockEditor.querySelectorAll('.orca-block-drag-handle')
dragHandles.forEach((el: Element) => {
(el as HTMLElement).style.display = 'none'
})

const collapseButtons = blockEditor.querySelectorAll('.orca-repr-collapse, [class*="collapse"]')
collapseButtons.forEach((el: Element) => {
(el as HTMLElement).style.display = 'none'
})
效果：最大化模式下，编辑器 UI 元素完全隐藏，获得沉浸式复习体验。
修改 5：移除主内容区的 padding（可选）
文件：src/components/SrsReviewSessionDemo.tsx 修改位置：第 371 行 当前代码：

<div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
优化为：
<div style={{ flex: 1, overflow: "auto", padding: "0" }}>
效果：卡片内容能更充分利用面板空间。
关键文件清单
文件	修改内容	优先级
src/srs/panelUtils.ts	调整面板宽度计算为50/50分割	P0（必需）
src/components/SrsCardDemo.tsx	注入CSS样式 + 增强MutationObserver	P1（必需）
src/components/SrsReviewSessionDemo.tsx	增强最大化模式 + 移除padding	P1（必需）
测试清单
面板宽度测试
 1920px显示器：左右各约960px
 2560px显示器：左约1200px，右约1360px
 手动拖动分隔条，确认可调整
 关闭重开，确认重置为50/50
平铺效果测试
 题目区域无bullet point
 答案区域无bullet point
 块手柄已隐藏
 折叠按钮已隐藏
 无多余缩进
 Block编辑功能正常
最大化模式测试
 点击最大化，编辑器UI完全隐藏
 点击还原，UI正常恢复
卡片类型兼容性
 Basic卡片显示正常
 Cloze卡片显示正常
 Direction卡片显示正常
实施步骤
修改panelUtils.ts - 调整面板宽度计算（10分钟）
修改SrsCardDemo.tsx - 注入CSS + 增强MutationObserver（20分钟）
修改SrsReviewSessionDemo.tsx - 增强最大化模式（10分钟）
运行npm run build - 编译插件
在Orca中测试 - 验证各项功能
风险与缓解
风险1：CSS优先级冲突
缓解：使用!important标记和高度特定的选择器
风险2：Orca版本更新导致选择器失效
缓解：使用多重选择器（class + data-role + data-testid）
风险3：小屏幕设备布局问题
缓解：保守调整最小宽度为600px，充分测试
