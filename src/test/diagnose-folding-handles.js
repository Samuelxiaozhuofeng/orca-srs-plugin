/**
 * 诊断折叠句柄悬浮行为
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行此脚本
 * 2. 悬浮到答案区域的不同块上
 * 3. 查看控制台输出，检查折叠句柄的显示状态
 */

console.log('=== 折叠句柄诊断脚本 ===')

// 查找答案区域
const answerArea = document.querySelector('.srs-card-back')
if (!answerArea) {
  console.error('未找到答案区域 (.srs-card-back)')
} else {
  console.log('✓ 找到答案区域')
  
  // 查找所有答案块
  const answerBlocks = answerArea.querySelectorAll('.orca-block')
  console.log(`✓ 找到 ${answerBlocks.length} 个答案块`)
  
  // 检查每个块的结构
  answerBlocks.forEach((block, index) => {
    const handle = block.querySelector('.orca-block-folding-handle')
    const hasChildren = block.querySelector('.orca-block-children, .orca-repr-children')
    
    console.log(`\n块 ${index + 1}:`, {
      blockId: block.getAttribute('data-rnd-id'),
      hasHandle: !!handle,
      hasChildren: !!hasChildren,
      handleDisplay: handle ? window.getComputedStyle(handle).display : 'N/A',
      handleVisibility: handle ? window.getComputedStyle(handle).visibility : 'N/A',
      handleOpacity: handle ? window.getComputedStyle(handle).opacity : 'N/A',
      blockClasses: block.className,
      parentElement: block.parentElement?.tagName,
      parentClasses: block.parentElement?.className
    })
    
    // 检查是否有额外的包装元素
    const parent = block.parentElement
    if (parent && parent.tagName === 'DIV' && !parent.classList.contains('srs-card-back')) {
      console.warn(`  ⚠️ 块 ${index + 1} 有额外的包装 div:`, {
        parentTag: parent.tagName,
        parentClasses: parent.className,
        parentStyle: parent.getAttribute('style')
      })
    }
  })
  
  // 监听鼠标悬浮事件
  console.log('\n=== 开始监听鼠标悬浮事件 ===')
  console.log('请悬浮到不同的答案块上...\n')
  
  let hoverTimeout
  answerArea.addEventListener('mouseover', (e) => {
    clearTimeout(hoverTimeout)
    hoverTimeout = setTimeout(() => {
      const target = e.target
      const block = target.closest('.orca-block')
      
      if (block) {
        const allHandles = answerArea.querySelectorAll('.orca-block-folding-handle')
        const visibleHandles = Array.from(allHandles).filter(h => {
          const style = window.getComputedStyle(h)
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        })
        
        console.log('悬浮事件:', {
          targetElement: target.tagName + (target.className ? '.' + target.className.split(' ')[0] : ''),
          hoveredBlockId: block.getAttribute('data-rnd-id'),
          totalHandles: allHandles.length,
          visibleHandles: visibleHandles.length,
          visibleHandleBlocks: visibleHandles.map(h => {
            const handleBlock = h.closest('.orca-block')
            return handleBlock?.getAttribute('data-rnd-id')
          })
        })
        
        if (visibleHandles.length > 1) {
          console.warn('⚠️ 检测到多个折叠句柄同时显示！这是不正常的。')
        } else if (visibleHandles.length === 1) {
          console.log('✓ 只有一个折叠句柄显示，行为正常')
        }
      }
    }, 100)
  }, true)
}

console.log('\n=== 诊断脚本已加载 ===')
