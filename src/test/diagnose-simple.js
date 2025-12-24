// 简化版诊断脚本 - 直接复制到浏览器控制台运行

(function() {
  const q = document.querySelector('.srs-question-block .orca-block');
  const a = document.querySelector('.srs-answer-block .orca-block');
  
  console.log('=== 题目 vs 答案 对比 ===\n');
  
  console.log('1. 渲染模式:');
  console.log('  题目:', q?.getAttribute('data-rendering-mode') || 'normal');
  console.log('  答案:', a?.getAttribute('data-rendering-mode') || 'normal');
  
  console.log('\n2. 块句柄（无序点）:');
  console.log('  题目:', q?.querySelector('.orca-block-handle') ? '✅ 有' : '❌ 无');
  console.log('  答案:', a?.querySelector('.orca-block-handle') ? '✅ 有' : '❌ 无');
  
  console.log('\n3. contentEditable:');
  const qc = q?.querySelector('.orca-repr-main-content');
  const ac = a?.querySelector('.orca-repr-main-content');
  console.log('  题目:', qc?.contentEditable, '(isContentEditable:', qc?.isContentEditable + ')');
  console.log('  答案:', ac?.contentEditable, '(isContentEditable:', ac?.isContentEditable + ')');
  
  console.log('\n4. 子块显示:');
  const qChildren = q?.querySelector('.orca-block-children');
  const aChildren = a?.querySelector('.orca-block-children');
  console.log('  题目子块:', qChildren ? window.getComputedStyle(qChildren).display : 'N/A');
  console.log('  答案子块:', aChildren ? window.getComputedStyle(aChildren).display : 'N/A');
  
  console.log('\n5. 工具栏相关元素:');
  console.log('  题目 .orca-active:', q?.classList.contains('orca-active') ? '✅' : '❌');
  console.log('  答案 .orca-active:', a?.classList.contains('orca-active') ? '✅' : '❌');
  
  console.log('\n=== 问题根源 ===');
  if (q?.getAttribute('data-rendering-mode') === 'simple') {
    console.log('❌ 题目使用了 renderingMode="simple"，这会导致:');
    console.log('   - 无序点（块句柄）不显示');
    console.log('   - 选中时不显示工具栏');
    console.log('   - 复制行为可能不同');
    console.log('\n💡 解决方案: 移除题目的 renderingMode="simple"');
  }
})();
