/**
 * 快捷制卡偏好（持久化）。
 *
 * 制卡弹窗的配置是**弹窗临时状态**：`openAIDialog` 每次打开都重置成默认值，
 * 因此「沿用制卡弹窗的配置」这句话原本无从落地。快捷制卡需要一份真正
 * 存得住的偏好，所以单开一个 plugin data 键。
 *
 * 刻意**不**包含卡型与详细程度：
 * - 卡型每次都随内容变（这句适合挖空、那段适合问答），所以由命令名决定；
 * - 详细程度固定为概要档——块下面挂十几张预览卡没法看也没法选，
 *   快捷路径的价值是「一眼看完、一秒决定」。要成批就该走弹窗。
 */

import {
  AI_CARD_LANGUAGES,
  AI_CUSTOM_INSTRUCTION_MAX,
  AUTO_CARD_CAP_FALLBACK,
  DEFAULT_AI_CARD_LANGUAGE,
  type AICardLanguage
} from "./aiDraftTypes"

/** plugin data 键。与 AI 连接设置分开，避免互相覆盖。 */
export const QUICK_CARD_PREFS_DATA_KEY = "ai.quickCard" as const

/** 单次快捷制卡允许的最大卡片数上限（防预览块挂几十张卡）。 */
export const QUICK_CARD_MAX_CAP = AUTO_CARD_CAP_FALLBACK
/** 缺省单次上限：与历史「概要档 2 张」行为一致。 */
export const DEFAULT_QUICK_CARD_MAX = 2

export interface QuickCardPrefs {
  cardLanguage: AICardLanguage
  customInstruction: string
  /** 专用 model id；空 = 用「AI 服务设置」的全局 model。 */
  model: string
  /**
   * 单次生成的卡片上限。0 = 由 AI 根据 block 内容自主决定数量；
   * >0 = 硬上限（clamp 到 QUICK_CARD_MAX_CAP）。
   */
  maxCards: number
}

const cache = new Map<string, QuickCardPrefs>()

/**
 * 归一化单次上限：0 合法（AI 自主）；负/NaN/缺失回退默认；>上限钳制。
 * null/undefined（旧数据缺字段）回退默认，与「0=自主」区分开。
 */
function normalizeMaxCards(value: unknown): number {
  if (value == null) return DEFAULT_QUICK_CARD_MAX
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_QUICK_CARD_MAX
  const floored = Math.floor(n)
  if (floored === 0) return 0
  if (floored < 0) return DEFAULT_QUICK_CARD_MAX
  return Math.min(floored, QUICK_CARD_MAX_CAP)
}

export function normalizeQuickCardPrefs(
  input: Partial<QuickCardPrefs> | null | undefined
): QuickCardPrefs {
  const language =
    typeof input?.cardLanguage === "string" &&
    (AI_CARD_LANGUAGES as readonly string[]).includes(input.cardLanguage)
      ? (input.cardLanguage as AICardLanguage)
      : DEFAULT_AI_CARD_LANGUAGE

  const instruction =
    typeof input?.customInstruction === "string"
      ? input.customInstruction.trim().slice(0, AI_CUSTOM_INSTRUCTION_MAX)
      : ""

  const model = typeof input?.model === "string" ? input.model.trim() : ""

  return {
    cardLanguage: language,
    customInstruction: instruction,
    model,
    maxCards: normalizeMaxCards(input?.maxCards)
  }
}

export function clearQuickCardPrefsCache(pluginName?: string): void {
  if (pluginName) cache.delete(pluginName)
  else cache.clear()
}

/** 同步读取；未 hydrate 时返回默认值。 */
export function getQuickCardPrefs(pluginName: string): QuickCardPrefs {
  const cached = cache.get(pluginName)
  return cached ? { ...cached } : normalizeQuickCardPrefs(null)
}

export async function hydrateQuickCardPrefs(
  pluginName: string
): Promise<QuickCardPrefs> {
  try {
    const raw = await orca.plugins.getData(pluginName, QUICK_CARD_PREFS_DATA_KEY)
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = JSON.parse(raw) as Partial<QuickCardPrefs>
      const value = normalizeQuickCardPrefs(parsed)
      cache.set(pluginName, value)
      return { ...value }
    }
  } catch (error) {
    // 读不出来就用默认值，但必须留痕：静默回落会让用户以为偏好没保存成功
    console.warn(
      `[AI 快捷制卡] 读取偏好失败（${QUICK_CARD_PREFS_DATA_KEY}），改用默认值:`,
      error
    )
  }

  const defaults = normalizeQuickCardPrefs(null)
  cache.set(pluginName, defaults)
  return { ...defaults }
}

export async function saveQuickCardPrefs(
  pluginName: string,
  next: Partial<QuickCardPrefs>
): Promise<QuickCardPrefs> {
  const cleaned = normalizeQuickCardPrefs(next)
  await orca.plugins.setData(
    pluginName,
    QUICK_CARD_PREFS_DATA_KEY,
    JSON.stringify(cleaned)
  )
  cache.set(pluginName, cleaned)
  return { ...cleaned }
}
