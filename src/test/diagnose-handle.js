// 诊断块句柄问题 - 复制到浏览器控制台运行

(function() {
  console.log('=== 诊断块句柄问题 ===\n');
  
  const q = document.querySelector('.srs-question-block');
  const a = document.querySelector('.srs-answer-block');
  
  console.log('1. 查找所有 .orca-block-handle:');
  const allHandles = document.querySelectorAll('.orca-block-handle');
  console.log('  页面上所有句柄数量:', allHandles.length);
  
  console.log('\n2. 题目块内的句柄:');
  if (q) {
    const qHandles = q.querySelectorAll('.orca-block-handle');
    console.log('  数量:', qHandles.length);
    if (qHandles.length > 0) {
      qHandles.forEach((h, i) => {
        console.log(`  句柄 ${i}:`, {
          className: h.className,
          display: window.getComputedStyle(h).display,
          visibility: window.getComputedStyle(h).visibility,
          opacity: window.getComputedStyle(h).opacity,
          parentElement: h.parentElement?.className
        });
      });
    } else {
      console.log('  ❌ 题目块内没有找到句柄');
      
      // 检查是否有 .orca-block
      const qBlock = q.querySelector('.orca-block');
      if (qBlock) {
        console.log('  题目块的 .orca-block 存在');
        console.log('  .orca-block 的直接子元素:');
        Array.from(qBlock.children).forEach((child, i) => {
          console.log(`    子元素 ${i}:`, {
            tagName: child.tagName,
            className: child.className
          });
        });
      }
    }
  }
  
  console.log('\n3. 答案块内的句柄:');
  if (a) {
    const aHandles = a.querySelectorAll('.orca-block-handle');
    console.log('  数量:', aHandles.length);
    if (aHandles.length > 0) {
      aHandles.forEach((h, i) => {
        console.log(`  句柄 ${i}:`, {
          className: h.className,
          display: window.getComputedStyle(h).display,
          visibility: window.getComputedStyle(h).visibility,
          opacity: window.getComputedStyle(h).opacity,
          parentElement: h.parentElement?.className
        });
      });
    }
  }
  
  console.log('\n4. 检查 data-hide-children 属性:');
  const hideChildrenElements = document.querySelectorAll('[data-hide-children]');
  console.log('  有 data-hide-children 属性的元素数量:', hideChildrenElements.length);
  hideChildrenElements.forEach((el, i) => {
    console.log(`  元素 ${i}:`, {
      className: el.className,
      'data-hide-children': el.getAttribute('data-hide-children'),
      hasHandle: !!el.querySelector('.orca-block-handle')
    });
  });
  
  console.log('\n5. 检查应用的 CSS 规则:');
  const styles = Array.from(document.querySelectorAll('style'));
  const hideChildrenStyles = styles.filter(s => s.textContent?.includes('hide-children'));
  console.log('  包含 hide-children 的 style 标签数量:', hideChildrenStyles.length);
  hideChildrenStyles.forEach((s, i) => {
    console.log(`  Style ${i}:`, s.textContent?.substring(0, 200));
  });
  
  console.log('\n=== 诊断完成 ===');
  console.log('\n💡 建议:');
  if (q && !q.querySelector('.orca-block-handle')) {
    console.log('❌ 题目块没有句柄，可能的原因:');
    console.log('   1. Block 组件没有渲染句柄（检查 renderingMode）');
    console.log('   2. CSS 规则隐藏了句柄');
    console.log('   3. 块的层级或结构不正确');
  }
})();
