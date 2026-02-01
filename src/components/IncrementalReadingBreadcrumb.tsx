import type { Block, DbId } from "../orca.d.ts"
import { extractCardType } from "../srs/deckUtils"

const { useEffect, useState } = window.React

const DEFAULT_MAX_TEXT_LENGTH = 24

type BreadcrumbProps = {
  blockId: DbId
  panelId: string
  maxDepth?: number
}

type BreadcrumbItem = {
  id: DbId
  text: string
  displayText: string
}

function normalizeBreadcrumbText(rawText: string | undefined): string {
  const normalized = (rawText ?? "").replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : "(无标题)"
}

function truncateBreadcrumbText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  if (maxLength <= 0) return ""
  if (maxLength <= 3) return "...".slice(0, maxLength)
  return text.substring(0, maxLength - 3) + "..."
}

async function getBlock(blockId: DbId): Promise<Block | undefined> {
  const cached = orca.state.blocks?.[blockId] ?? orca.state.blocks?.[String(blockId)]
  if (cached) return cached
  return await orca.invokeBackend("get-block", blockId) as Block | undefined
}

async function findRootBlock(blockId: DbId, maxDepth: number): Promise<Block | undefined> {
  let currentId: DbId | undefined = blockId
  let current: Block | undefined
  let depth = 0

  while (currentId && depth < maxDepth) {
    const block = await getBlock(currentId)
    if (!block) break
    current = block
    if (!block.parent) break
    currentId = block.parent
    depth += 1
  }

  return current
}

async function findBreadcrumbItems(blockId: DbId, maxDepth: number): Promise<BreadcrumbItem[]> {
  const cardBlock = await getBlock(blockId)
  if (!cardBlock) return []

  // Extract 卡：顶部显示父块（extract 的 father block），而不是 extract 本身。
  let focusBlock = cardBlock
  if (extractCardType(cardBlock) === "extracts" && cardBlock.parent) {
    const parentBlock = await getBlock(cardBlock.parent)
    if (parentBlock) {
      focusBlock = parentBlock
    }
  }

  const rootBlock = await findRootBlock(focusBlock.id, maxDepth)
  const items: BreadcrumbItem[] = []

  const rootText = normalizeBreadcrumbText(rootBlock?.text)
  const focusText = normalizeBreadcrumbText(focusBlock.text)

  if (rootBlock && rootBlock.id !== focusBlock.id) {
    items.push({
      id: rootBlock.id,
      text: rootText,
      displayText: truncateBreadcrumbText(rootText, DEFAULT_MAX_TEXT_LENGTH)
    })
  }

  items.push({
    id: focusBlock.id,
    text: focusText,
    displayText: truncateBreadcrumbText(focusText, DEFAULT_MAX_TEXT_LENGTH)
  })

  return items
}

export default function IncrementalReadingBreadcrumb({
  blockId,
  panelId,
  maxDepth = 20
}: BreadcrumbProps) {
  const [items, setItems] = useState<BreadcrumbItem[]>([])

  useEffect(() => {
    let cancelled = false

    const loadPath = async () => {
      try {
        const path = await findBreadcrumbItems(blockId, maxDepth)
        if (!cancelled) {
          setItems(path)
        }
      } catch (error) {
        console.error("[IR Breadcrumb] 读取面包屑失败:", error)
      }
    }

    void loadPath()

    return () => {
      cancelled = true
    }
  }, [blockId, maxDepth])

  if (items.length === 0) {
    return null
  }

  const handleJump = (targetId: DbId, shiftKey?: boolean) => {
    if (shiftKey) {
      orca.nav.openInLastPanel("block", { blockId: targetId })
    } else {
      orca.nav.goTo("block", { blockId: targetId }, panelId)
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      flexWrap: "wrap"
    }}>
      {items.map((item: BreadcrumbItem, index: number) => {
        const isLast = index === items.length - 1
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              onClick={event => handleJump(item.id, event.shiftKey)}
              style={{
                cursor: "pointer",
                color: isLast ? "var(--orca-color-text-1)" : "var(--orca-color-primary-6)",
                fontWeight: isLast ? 600 : 500
              }}
              title={item.text}
            >
              {item.displayText}
            </span>
            {!isLast && <span style={{ color: "var(--orca-color-text-3)" }}>{">"}</span>}
          </div>
        )
      })}
    </div>
  )
}
