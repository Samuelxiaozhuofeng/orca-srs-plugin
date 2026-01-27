import type { KnowledgePoint } from "../srs/ai/aiKnowledgeExtractor"

const { useState, useMemo } = window.React

export interface GenerationConfig {
  selectedKnowledgePoints: string[]
  customInput: string
  cardType: "basic" | "cloze"
}

interface AICardGenerationDialogProps {
  visible: boolean
  onClose: () => void
  knowledgePoints: KnowledgePoint[]
  originalContent: string
  onGenerate: (config: GenerationConfig) => Promise<void>
}

export function AICardGenerationDialog(props: AICardGenerationDialogProps) {
  const { visible, onClose, knowledgePoints, originalContent, onGenerate } = props
  const { ModalOverlay, Checkbox, Button } = orca.components
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(knowledgePoints.filter(kp => kp.recommended).map(kp => kp.id))
  )
  const [customInput, setCustomInput] = useState("")
  const [cardType, setCardType] = useState<"basic" | "cloze">("basic")
  const [isGenerating, setIsGenerating] = useState(false)
  
  const handleToggle = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    setSelectedIds(newSet)
  }
  
  const estimatedCardCount = useMemo(() => {
    let count = selectedIds.size
    if (customInput.trim()) {
      count += 1
    }
    return count
  }, [selectedIds, customInput])
  
  const handleGenerate = async () => {
    if (selectedIds.size === 0 && !customInput.trim()) {
      orca.notify("warn", "请至少选择一个知识点或输入自定义内容")
      return
    }
    
    setIsGenerating(true)
    
    try {
      await onGenerate({
        selectedKnowledgePoints: Array.from(selectedIds),
        customInput: customInput.trim(),
        cardType
      })
      onClose()
    } catch (error) {
      console.error("[AI Card Generation Dialog] 生成失败:", error)
      orca.notify("error", "生成卡片失败，请重试")
    } finally {
      setIsGenerating(false)
    }
  }
  
  if (!visible) return null
  
  return (
    <ModalOverlay visible={visible} canClose={!isGenerating} onClose={onClose}>
      <div
        style={{
          background: "var(--orca-bg-primary, #ffffff)",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "600px",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          border: "1px solid var(--orca-border, #e0e0e0)",
          backdropFilter: "blur(10px)"
        }}
        className="ai-card-dialog"
      >
        <h2 style={{ 
          margin: "0 0 20px 0", 
          fontSize: "20px", 
          fontWeight: 600,
          color: "var(--orca-text-primary, #333)",
          borderBottom: "2px solid var(--orca-border, #e0e0e0)",
          paddingBottom: "12px"
        }}>
          🤖 AI 智能制卡
        </h2>
        
        <div
          style={{
            background: "var(--orca-bg-secondary, #f5f5f5)",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "20px",
            border: "1px solid var(--orca-border, #e0e0e0)"
          }}
        >
          <strong style={{ fontSize: "14px", color: "var(--orca-text-primary, #333)" }}>原始内容：</strong>
          <p style={{ margin: "8px 0 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--orca-text-primary, #333)" }}>
            {originalContent}
          </p>
        </div>
        
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ 
            margin: "0 0 12px 0", 
            fontSize: "16px", 
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }}>
            检测到的知识点：
          </h3>
          {knowledgePoints.length === 0 ? (
            <p style={{ color: "var(--orca-text-secondary)", fontSize: "14px" }}>
              未检测到知识点，请使用自定义输入
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {knowledgePoints.map(kp => (
                <div
                  key={kp.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "12px",
                    border: "1px solid var(--orca-border, #e0e0e0)",
                    borderRadius: "8px",
                    transition: "all 0.2s",
                    cursor: "pointer",
                    background: selectedIds.has(kp.id) 
                      ? "var(--orca-bg-secondary, #f0f7ff)" 
                      : "var(--orca-bg-primary, #ffffff)"
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedIds.has(kp.id)) {
                      e.currentTarget.style.background = "var(--orca-bg-hover, #f5f5f5)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedIds.has(kp.id) 
                      ? "var(--orca-bg-secondary, #f0f7ff)" 
                      : "var(--orca-bg-primary, #ffffff)"
                  }}
                  onClick={() => handleToggle(kp.id, !selectedIds.has(kp.id))}
                >
                  <Checkbox
                    checked={selectedIds.has(kp.id)}
                    onChange={({ checked }) => handleToggle(kp.id, checked)}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontWeight: 500, fontSize: "14px", color: "var(--orca-text-primary, #333)" }}>
                      {kp.text}
                      {kp.recommended && (
                        <span style={{ 
                          marginLeft: "8px", 
                          fontSize: "12px", 
                          color: "var(--orca-color-primary, #0066cc)",
                          fontWeight: 400
                        }}>
                          (推荐)
                        </span>
                      )}
                    </span>
                    {kp.description && (
                      <span style={{ fontSize: "13px", color: "var(--orca-text-secondary, #666)" }}>
                        {kp.description}
                      </span>
                    )}
                    <span style={{ fontSize: "12px", color: "var(--orca-text-tertiary, #999)" }}>
                      难度: {"⭐".repeat(kp.difficulty || 3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ 
            margin: "0 0 8px 0", 
            fontSize: "16px", 
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }}>
            自定义知识点：
          </h3>
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="输入其他想要学习的内容..."
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "14px",
              borderRadius: "6px",
              border: "1px solid var(--orca-border, #d0d0d0)",
              backgroundColor: "var(--orca-bg-primary, #ffffff)",
              color: "var(--orca-text-primary, #333)",
              outline: "none",
              transition: "border-color 0.2s"
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--orca-color-primary, #0066cc)"
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--orca-border, #d0d0d0)"
            }}
          />
        </div>
        
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ 
            margin: "0 0 12px 0", 
            fontSize: "16px", 
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }}>
            卡片类型：
          </h3>
          <div style={{ display: "flex", gap: "12px" }}>
            <Button
              variant={cardType === "basic" ? "solid" : "outline"}
              onClick={() => setCardType("basic")}
              style={{ flex: 1, fontSize: "14px" }}
            >
              📝 Basic Card（问答卡）
            </Button>
            <Button
              variant={cardType === "cloze" ? "solid" : "outline"}
              onClick={() => setCardType("cloze")}
              style={{ flex: 1, fontSize: "14px" }}
            >
              🔤 Cloze Card（填空卡）
            </Button>
          </div>
        </div>
        
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
          <Button
            variant="outline"
            onClick={onClose}
            style={{ fontSize: "14px", opacity: isGenerating ? 0.5 : 1, pointerEvents: isGenerating ? "none" : "auto" }}
          >
            取消
          </Button>
          <Button
            variant="solid"
            onClick={handleGenerate}
            style={{ 
              fontSize: "14px", 
              opacity: (isGenerating || (selectedIds.size === 0 && !customInput.trim())) ? 0.5 : 1,
              pointerEvents: (isGenerating || (selectedIds.size === 0 && !customInput.trim())) ? "none" : "auto"
            }}
          >
            {isGenerating ? "生成中..." : `生成 ${estimatedCardCount} 张卡片`}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}
