/**
 * 诊断题目和答案块渲染差异的测试脚本
 * 在浏览器控制台运行此脚本
 */

function diagnoseBlockRendering() {
  console.log('=== 开始诊断题目和答案块渲染差异 ===\n')
  
  // 查找题目和答案容器
  const questionBlock = document.querySelector('.srs-question-block')
  const answerBlock = document.querySelector('.srs-answer-block')
  
  if (!questionBlock) {
    console.error('❌ 未找到题目块 (.srs-question-block)')
    return
  }
  
  if (!answerBlock) {
    console.error('❌ 未找到答案块 (.srs-answer-block)')
    return
  }
  
  console.log('✅ 找到题目块和答案块\n')
  
  // 1. 检查 Block 组件的 props
  console.log('📋 1. Block 组件渲染模式检查')
  console.log('-----------------------------------')
  
  const questionOrcaBlock = questionBlock.querySelector('.orca-block')
  const answerOrcaBlock = answerBlock.querySelector('.orca-block')
  
  if (questionOrcaBlock) {
    console.log('题目块 .orca-block 属性:', {
      'data-type': questionOrcaBlock.getAttribute('data-type'),
      'data-editable': questionOrcaBlock.getAttribute('data-editable'),
      'data-rendering-mode': questionOrcaBlock.getAttribute('data-rendering-mode'),
      className: questionOrcaBlock.className
    })
  } else {
    console.log('❌ 题目块中未找到 .orca-block')
  }
  
  if (answerOrcaBlock) {
    console.log('答案块 .orca-block 属性:', {
      'data-type': answerOrcaBlock.getAttribute('data-type'),
      'data-editable': answerOrcaBlock.getAttribute('data-editable'),
      'data-rendering-mode': answerOrcaBlock.getAttribute('data-rendering-mode'),
      className: answerOrcaBlock.className
    })
  } else {
    console.log('❌ 答案块中未找到 .orca-block')
  }
  
  console.log('\n')
  
  // 2. 检查块句柄（无序点）
  console.log('📋 2. 块句柄（无序点）检查')
  console.log('-----------------------------------')
  
  const questionHandle = questionBlock.querySelector('.orca-block-handle')
  const answerHandle = answerBlock.querySelector('.orca-block-handle')
  
  console.log('题目块句柄:', questionHandle ? '✅ 存在' : '❌ 不存在')
  console.log('答案块句柄:', answerHandle ? '✅ 存在' : '❌ 不存在')
  
  if (questionHandle) {
    console.log('题目块句柄详情:', {
      className: questionHandle.className,
      innerHTML: questionHandle.innerHTML,
      display: window.getComputedStyle(questionHandle).display
    })
  }
  
  if (answerHandle) {
    console.log('答案块句柄详情:', {
      className: answerHandle.className,
      innerHTML: answerHandle.innerHTML,
      display: window.getComputedStyle(answerHandle).display
    })
  }
  
  console.log('\n')
  
  // 3. 检查 contentEditable 属性
  console.log('📋 3. contentEditable 属性检查')
  console.log('-----------------------------------')
  
  const questionContent = questionBlock.querySelector('.orca-repr-main-content')
  const answerContent = answerBlock.querySelector('.orca-repr-main-content')
  
  if (questionContent) {
    console.log('题目内容区域:', {
      contentEditable: questionContent.contentEditable,
      isContentEditable: questionContent.isContentEditable,
      'data-placeholder': questionContent.getAttribute('data-placeholder')
    })
  }
  
  if (answerContent) {
    console.log('答案内容区域:', {
      contentEditable: answerContent.contentEditable,
      isContentEditable: answerContent.isContentEditable,
      'data-placeholder': answerContent.getAttribute('data-placeholder')
    })
  }
  
  console.log('\n')
  
  // 4. 检查 CSS 样式
  console.log('📋 4. CSS 样式检查')
  console.log('-----------------------------------')
  
  if (questionContent) {
    const qStyle = window.getComputedStyle(questionContent)
    console.log('题目内容样式:', {
      userSelect: qStyle.userSelect,
      pointerEvents: qStyle.pointerEvents,
      cursor: qStyle.cursor,
      display: qStyle.display
    })
  }
  
  if (answerContent) {
    const aStyle = window.getComputedStyle(answerContent)
    console.log('答案内容样式:', {
      userSelect: aStyle.userSelect,
      pointerEvents: aStyle.pointerEvents,
      cursor: aStyle.cursor,
      display: aStyle.display
    })
  }
  
  console.log('\n')
  
  // 5. 检查子块
  console.log('📋 5. 子块检查')
  console.log('-----------------------------------')
  
  const questionChildren = questionBlock.querySelectorAll('.orca-block-children, .orca-repr-children')
  const answerChildren = answerBlock.querySelectorAll('.orca-block-children, .orca-repr-children')
  
  console.log('题目子块容器数量:', questionChildren.length)
  console.log('答案子块容器数量:', answerChildren.length)
  
  if (questionChildren.length > 0) {
    console.log('题目子块容器样式:', {
      display: window.getComputedStyle(questionChildren[0]).display,
      visibility: window.getComputedStyle(questionChildren[0]).visibility
    })
  }
  
  if (answerChildren.length > 0) {
    console.log('答案子块容器样式:', {
      display: window.getComputedStyle(answerChildren[0]).display,
      visibility: window.getComputedStyle(answerChildren[0]).visibility
    })
  }
  
  console.log('\n')
  
  // 6. 检查 DOM 结构差异
  console.log('📋 6. DOM 结构对比')
  console.log('-----------------------------------')
  
  console.log('题目块 HTML 结构（前 500 字符）:')
  console.log(questionBlock.innerHTML.substring(0, 500))
  console.log('\n答案块 HTML 结构（前 500 字符）:')
  console.log(answerBlock.innerHTML.substring(0, 500))
  
  console.log('\n')
  
  // 7. 检查事件监听器
  console.log('📋 7. 事件监听器检查')
  console.log('-----------------------------------')
  console.log('提示: 尝试以下操作并观察控制台输出:')
  console.log('1. 点击题目文字')
  console.log('2. 点击答案文字')
  console.log('3. 选中题目文字')
  console.log('4. 选中答案文字')
  console.log('5. 尝试编辑题目')
  console.log('6. 尝试编辑答案')
  
  console.log('\n=== 诊断完成 ===')
  console.log('\n💡 关键差异总结:')
  
  const differences = []
  
  if (questionHandle && !answerHandle) {
    differences.push('❌ 题目有句柄但答案没有（不正常）')
  } else if (!questionHandle && answerHandle) {
    differences.push('❌ 答案有句柄但题目没有（这是问题所在！）')
  }
  
  if (questionContent && answerContent) {
    if (questionContent.contentEditable !== answerContent.contentEditable) {
      differences.push(`❌ contentEditable 不同: 题目=${questionContent.contentEditable}, 答案=${answerContent.contentEditable}`)
    }
    
    if (questionContent.isContentEditable !== answerContent.isContentEditable) {
      differences.push(`❌ isContentEditable 不同: 题目=${questionContent.isContentEditable}, 答案=${answerContent.isContentEditable}`)
    }
  }
  
  if (questionOrcaBlock && answerOrcaBlock) {
    const qMode = questionOrcaBlock.getAttribute('data-rendering-mode')
    const aMode = answerOrcaBlock.getAttribute('data-rendering-mode')
    if (qMode !== aMode) {
      differences.push(`❌ renderingMode 不同: 题目=${qMode || 'normal'}, 答案=${aMode || 'normal'}`)
    }
  }
  
  if (differences.length === 0) {
    console.log('✅ 未发现明显差异')
  } else {
    differences.forEach(diff => console.log(diff))
  }
  
  return {
    questionBlock,
    answerBlock,
    questionOrcaBlock,
    answerOrcaBlock,
    questionHandle,
    answerHandle,
    questionContent,
    answerContent
  }
}

// 自动运行诊断
console.log('💡 运行 diagnoseBlockRendering() 来诊断题目和答案块的差异')
console.log('💡 或者直接调用: window.diagnoseBlockRendering = diagnoseBlockRendering')

// 导出到全局
if (typeof window !== 'undefined') {
  window.diagnoseBlockRendering = diagnoseBlockRendering
}
