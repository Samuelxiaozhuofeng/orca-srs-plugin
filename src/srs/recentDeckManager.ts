import type { Block, BlockRef, DbId } from "../orca.d.ts"
import { isCardTag } from "./tagUtils"

const RECENT_DECK_DATA_KEY = "recentDeckPreference"
const DEFAULT_DECK_NAME = "Default"
const DECK_PROPERTY_NAME = "牌组"
const REF_TYPE_REFDATA = 3

export type RecentDeckPreference = {
  deckName: string
  deckBlockId: DbId
  updatedAt: number
}

let unsubscribeRecentDeckWatcher: (() => void) | null = null
let saveInProgress = false
let setRefDataAfterHook: ((commandId: string, ...args: unknown[]) => void) | null = null

function normalizeDbId(value: unknown): DbId | null {
  if (typeof value === "number" && Number.isFinite(value)) return value as DbId
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed as DbId
  }
  return null
}

function getCardRef(block: Block | undefined): BlockRef | undefined {
  return block?.refs?.find(ref => ref.type === 2 && isCardTag(ref.alias))
}

function findDeckDataChange(args: unknown[]): { name: string; value: unknown } | null {
  for (const arg of args) {
    if (!Array.isArray(arg)) continue

    const deckData = arg.find((item): item is { name: string; value: unknown } => {
      if (!item || typeof item !== "object") return false
      return (item as { name?: unknown }).name === DECK_PROPERTY_NAME
    })

    if (deckData) return deckData
  }

  return null
}

function isEmptyDeckValue(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0)
}

async function getBlockText(blockId: DbId): Promise<string | null> {
  const stateBlock = orca.state.blocks?.[blockId] as Block | undefined
  const stateText = stateBlock?.text?.trim()
  if (stateText) return stateText

  const backendBlock = await orca.invokeBackend("get-block", blockId) as Block | undefined
  const backendText = backendBlock?.text?.trim()
  return backendText || null
}

export async function getRecentDeckPreference(pluginName: string): Promise<RecentDeckPreference | null> {
  const stored = await orca.plugins.getData(pluginName, RECENT_DECK_DATA_KEY)
  if (!stored || typeof stored !== "string") return null

  try {
    const parsed = JSON.parse(stored) as Partial<RecentDeckPreference>
    const deckBlockId = normalizeDbId(parsed.deckBlockId)
    if (!parsed.deckName || !deckBlockId || !parsed.updatedAt) return null

    return {
      deckName: parsed.deckName,
      deckBlockId,
      updatedAt: parsed.updatedAt
    }
  } catch (error) {
    console.warn(`[${pluginName}] 最近牌组偏好解析失败:`, error)
    return null
  }
}

export async function saveRecentDeckPreference(
  pluginName: string,
  preference: Omit<RecentDeckPreference, "updatedAt">
): Promise<void> {
  const deckName = preference.deckName.trim()
  if (!deckName || deckName === DEFAULT_DECK_NAME) return

  const current = await getRecentDeckPreference(pluginName)
  if (current?.deckName === deckName && current.deckBlockId === preference.deckBlockId) {
    return
  }

  const next: RecentDeckPreference = {
    deckName,
    deckBlockId: preference.deckBlockId,
    updatedAt: Date.now()
  }

  await orca.plugins.setData(pluginName, RECENT_DECK_DATA_KEY, JSON.stringify(next))
  console.log(`[${pluginName}] 最近牌组已更新为: ${deckName}`)
}

export async function clearRecentDeckPreference(pluginName: string): Promise<void> {
  await orca.plugins.setData(pluginName, RECENT_DECK_DATA_KEY, null)
}

export async function resolveCardDeckReference(block: Block): Promise<RecentDeckPreference | null> {
  const cardRef = getCardRef(block)
  const deckProperty = cardRef?.data?.find(data => data.name === DECK_PROPERTY_NAME)
  const refIds = deckProperty?.value
  if (!Array.isArray(refIds) || refIds.length === 0) return null

  const firstRefId = normalizeDbId(refIds[0])
  if (!firstRefId) return null

  const deckRef = block.refs?.find(ref => ref.id === firstRefId)
  if (!deckRef) return null

  const deckName = await getBlockText(deckRef.to)
  if (!deckName || deckName === DEFAULT_DECK_NAME) return null

  return {
    deckName,
    deckBlockId: deckRef.to,
    updatedAt: Date.now()
  }
}

export async function createRecentDeckRef(pluginName: string, blockId: DbId): Promise<DbId | null> {
  const preference = await getRecentDeckPreference(pluginName)
  if (!preference) return null

  const deckName = await getBlockText(preference.deckBlockId)
  if (!deckName) return null

  const refId = await orca.commands.invokeEditorCommand(
    "core.editor.createRef",
    null,
    blockId,
    preference.deckBlockId,
    REF_TYPE_REFDATA
  )

  return normalizeDbId(refId)
}

async function inspectAndSaveDeck(pluginName: string, blockId: DbId): Promise<void> {
  const block =
    (orca.state.blocks?.[blockId] as Block | undefined) ||
    ((await orca.invokeBackend("get-block", blockId)) as Block | undefined)

  if (!block) return

  const deck = await resolveCardDeckReference(block)
  if (!deck) return

  await saveRecentDeckPreference(pluginName, {
    deckName: deck.deckName,
    deckBlockId: deck.deckBlockId
  })
}

export function startRecentDeckWatcher(pluginName: string): void {
  if (unsubscribeRecentDeckWatcher) return

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  setRefDataAfterHook = (_commandId: string, ...args: unknown[]) => {
    const ref = args.find((arg): arg is BlockRef => {
      if (!arg || typeof arg !== "object") return false
      const maybeRef = arg as Partial<BlockRef>
      return typeof maybeRef.id === "number" && typeof maybeRef.from === "number"
    })

    if (!ref || ref.type !== 2 || !isCardTag(ref.alias)) return

    const deckDataChange = findDeckDataChange(args)
    if (!deckDataChange) return

    if (isEmptyDeckValue(deckDataChange.value)) {
      clearRecentDeckPreference(pluginName).catch(error => {
        console.error(`[${pluginName}] 清除最近牌组失败:`, error)
      })
      return
    }

    setTimeout(() => {
      inspectAndSaveDeck(pluginName, ref.from).catch(error => {
        console.error(`[${pluginName}] 最近牌组命令监听失败:`, error)
      })
    }, 100)
  }

  orca.commands.registerAfterCommand("core.editor.setRefData", setRefDataAfterHook)

  unsubscribeRecentDeckWatcher = (window as any).Valtio.subscribe(orca.state.blocks, (ops?: any) => {
    if (timeoutId) clearTimeout(timeoutId)

    timeoutId = setTimeout(() => {
      if (saveInProgress) return

      const ids = new Set<DbId>()
      if (Array.isArray(ops)) {
        for (const op of ops) {
          if (!op || op.type !== "set") continue
          if (!Array.isArray(op.path) || op.path.length < 1) continue
          const id = normalizeDbId(op.path[0])
          if (id) ids.add(id)
        }
      }

      if (ids.size === 0) return

      const candidates = Array.from(ids)

      saveInProgress = true
      Promise.allSettled(candidates.map(id => inspectAndSaveDeck(pluginName, id)))
        .catch(error => {
          console.error(`[${pluginName}] 最近牌组监听失败:`, error)
        })
        .finally(() => {
          saveInProgress = false
        })
    }, 500)
  })
}

export function stopRecentDeckWatcher(): void {
  if (setRefDataAfterHook) {
    orca.commands.unregisterAfterCommand("core.editor.setRefData", setRefDataAfterHook)
    setRefDataAfterHook = null
  }

  if (!unsubscribeRecentDeckWatcher) return
  unsubscribeRecentDeckWatcher()
  unsubscribeRecentDeckWatcher = null
}
