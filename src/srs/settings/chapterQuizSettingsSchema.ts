/**
 * 章末小测偏好（持久化）：出题数量 / 题目语言 / 自定义提示词 / 专用模型。
 *
 * 编辑入口在「AI / Firecrawl 服务设置」面板的「章末小测」分区；
 * plugin data 键 `ai.chapterQuiz` 持久化，与 AI 连接设置、快捷制卡偏好相互独立。
 *
 * 语言语义与快捷制卡一致：`auto` 跟随源文本；指定语言时仅**题干 / 选项 /
 * 讲解措辞**使用该语言，事实与关键术语仍忠实于源文本（小测无接地校验，
 * 选项由模型合成，因此只约束措辞不约束引用）。
 */

import {
  AI_CARD_LANGUAGES,
  AI_CUSTOM_INSTRUCTION_MAX,
  DEFAULT_AI_CARD_LANGUAGE,
  type AICardLanguage
} from "../ai/aiDraftTypes"

/** plugin data 键。 */
export const CHAPTER_QUIZ_PREFS_DATA_KEY = "ai.chapterQuiz" as const

/** 出题数量（条）可配置区间。 */
export const CHAPTER_QUIZ_COUNT_MIN = 3
export const CHAPTER_QUIZ_COUNT_MAX = 30
/**
 * 默认出题数量。与 `chapterQuiz.ts` 的 `CHAPTER_QUIZ_DEFAULT_COUNT` 保持一致
 * （后者作为 repr 兜底默认值；未配置时两者同为 10）。
 */
export const DEFAULT_CHAPTER_QUIZ_COUNT = 10

export interface ChapterQuizPrefs {
  /** 一次小测出题数量（3–30）。 */
  questionCount: number
  /** 题目语言：auto 跟随源文本；zh/en/ja 指定措辞语言。 */
  language: AICardLanguage
  /** 自定义提示词（追加进 system prompt；≤ AI_CUSTOM_INSTRUCTION_MAX）。 */
  customPrompt: string
  /** 专用 model id；空 = 用「AI 服务设置」全局 model。 */
  model: string
}

type CacheEntry = { value: ChapterQuizPrefs }

const chapterQuizPrefsCache = new Map<string, CacheEntry>()

export function clearChapterQuizPrefsCache(pluginName?: string): void {
  if (pluginName) {
    chapterQuizPrefsCache.delete(pluginName)
    return
  }
  chapterQuizPrefsCache.clear()
}

export function normalizeChapterQuizPrefs(
  input: Partial<ChapterQuizPrefs> | null | undefined
): ChapterQuizPrefs {
  const rawCount = input?.questionCount
  let questionCount = DEFAULT_CHAPTER_QUIZ_COUNT
  if (typeof rawCount === "number" && Number.isFinite(rawCount)) {
    // 数字越界钳制到边界；非数字回退默认
    const floored = Math.floor(rawCount)
    if (floored < CHAPTER_QUIZ_COUNT_MIN) {
      questionCount = CHAPTER_QUIZ_COUNT_MIN
    } else if (floored > CHAPTER_QUIZ_COUNT_MAX) {
      questionCount = CHAPTER_QUIZ_COUNT_MAX
    } else {
      questionCount = floored
    }
  }

  const language =
    typeof input?.language === "string" &&
    (AI_CARD_LANGUAGES as readonly string[]).includes(input.language)
      ? (input.language as AICardLanguage)
      : DEFAULT_AI_CARD_LANGUAGE

  const customPrompt =
    typeof input?.customPrompt === "string"
      ? input.customPrompt.trim().slice(0, AI_CUSTOM_INSTRUCTION_MAX)
      : ""

  const model = typeof input?.model === "string" ? input.model.trim() : ""

  return { questionCount, language, customPrompt, model }
}

/** 同步读取；未 hydrate 时返回默认值。 */
export function getChapterQuizPrefs(pluginName: string): ChapterQuizPrefs {
  const cached = chapterQuizPrefsCache.get(pluginName)
  return cached ? { ...cached.value } : normalizeChapterQuizPrefs(null)
}

export async function hydrateChapterQuizPrefs(
  pluginName: string
): Promise<ChapterQuizPrefs> {
  try {
    const raw = await orca.plugins.getData(pluginName, CHAPTER_QUIZ_PREFS_DATA_KEY)
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = JSON.parse(raw) as Partial<ChapterQuizPrefs>
      const value = normalizeChapterQuizPrefs(parsed)
      chapterQuizPrefsCache.set(pluginName, { value })
      return { ...value }
    }
  } catch (error) {
    // 读不出来就用默认值，但必须留痕：静默回落会让用户以为偏好没保存成功
    console.warn(
      `[章末小测] 读取偏好失败（${CHAPTER_QUIZ_PREFS_DATA_KEY}），改用默认值:`,
      error
    )
  }

  const defaults = normalizeChapterQuizPrefs(null)
  chapterQuizPrefsCache.set(pluginName, { value: defaults })
  return { ...defaults }
}

export async function saveChapterQuizPrefs(
  pluginName: string,
  next: Partial<ChapterQuizPrefs>
): Promise<ChapterQuizPrefs> {
  const cleaned = normalizeChapterQuizPrefs(next)
  await orca.plugins.setData(
    pluginName,
    CHAPTER_QUIZ_PREFS_DATA_KEY,
    JSON.stringify(cleaned)
  )
  chapterQuizPrefsCache.set(pluginName, { value: cleaned })
  return { ...cleaned }
}
