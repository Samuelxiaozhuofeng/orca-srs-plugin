/**
 * Cloze 填空 Inline 渲染器
 *
 * 用于在编辑器中渲染 {cN:: 文本} 格式的填空标记
 * - 隐藏 {cN::} 符号
 * - 填空文本呈现浅灰色
 * - 底部显示蓝色下划线
 */

import type { ContentFragment } from "../orca.d.ts"

const { useRef, useState } = window.React
const { ModalOverlay } = orca.components

interface ClozeInlineRendererProps {
  blockId: string
  data: ContentFragment
  index: number
}

/**
 * Cloze Inline 渲染器组件
 *
 * 接收的 data 格式：
 * {
 *   t: "插件名.cloze",
 *   v: "填空内容",
 *   clozeNumber: 1
 * }
 */
export default function ClozeInlineRenderer({
  blockId,
  data,
  index,
}: ClozeInlineRendererProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [showModal, setShowModal] = useState(false)
  const [editNumber, setEditNumber] = useState<number>((data as any).clozeNumber || 1)
  const [editText, setEditText] = useState<string>(data.v || "")

  // 从 data 中提取填空内容和编号
  const clozeText = data.v || ""
  const clozeNumber = (data as any).clozeNumber || 1

  // 双击事件处理函数
  const handleDoubleClick = () => {
    setEditNumber(clozeNumber)
    setEditText(clozeText)
    setShowModal(true)
  }

  return (
    <>
      <span
        ref={ref}
        className="orca-inline srs-cloze-inline"
        data-cloze-number={clozeNumber}
        style={{
          color: "#999", // 浅灰色
          borderBottom: "2px solid #4a90e2", // 蓝色下划线
          paddingBottom: "1px",
          cursor: "text"
        }}
        title={`Cloze ${clozeNumber}`}
        onDoubleClick={handleDoubleClick}
      >
        {clozeText}
      </span>

      {/* 序号修改弹窗 */}
      {showModal && (
        <ModalOverlay
          visible={showModal}
          canClose={true}
          onClose={() => setShowModal(false)}
          className="srs-cloze-edit-modal"
        >
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            minWidth: '300px'
          }}>
            <h3 style={{ marginBottom: '15px', fontSize: '16px' }}>修改填空</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>序号：</label>
              <input
                type="number"
                min="1"
                value={editNumber}
                onChange={(e) => setEditNumber(parseInt(e.target.value) || 1)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>填空内容：</label>
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f5f5f5',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    // 获取当前块
                    const block = (window as any).orca?.state?.blocks?.[blockId]
                    if (!block || !block.content) {
                      console.error('无法获取块信息')
                      return
                    }

                    // 构建新的内容数组，更新指定索引的 cloze fragment
                    const newContent = [...block.content]
                    const fragment = newContent[index]
                    
                    if (fragment && fragment.t.includes('.cloze')) {
                      // 更新 clozeNumber 和内容
                      (fragment as any).clozeNumber = editNumber
                      fragment.v = editText

                      // 使用 setBlocksContent 更新块内容
                      await (window as any).orca?.commands?.invokeEditorCommand(
                        "core.editor.setBlocksContent",
                        null, // cursor 参数可以为 null
                        [
                          {
                            id: blockId,
                            content: newContent
                          }
                        ],
                        false
                      )

                      console.log('填空已更新:', { number: editNumber, text: editText })
                    }
                  } catch (error) {
                    console.error('更新填空失败:', error)
                  } finally {
                    setShowModal(false)
                  }
                }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #4a90e2',
                  borderRadius: '4px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                保存
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  )
}
