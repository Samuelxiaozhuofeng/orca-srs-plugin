/**
 * 复习设置 Schema 模块
 * 
 * 定义复习界面的配置选项
 */

/**
 * FSRS v6 默认权重参数（21个）
 * 
 * 这是 ts-fsrs 官方默认值，来自 FSRS-6.0 算法。
 * 如果需要调整请使用 FSRS 优化器计算。
 * 
 * @see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */
export const DEFAULT_FSRS_WEIGHTS = "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542"

/** 每日新卡上限默认值 */
export const DEFAULT_NEW_CARDS_PER_DAY = 30

/** 每日复习卡上限默认值 */
export const DEFAULT_REVIEW_CARDS_PER_DAY = 200

/** FSRS 目标记忆保留率默认值 */
export const DEFAULT_REQUEST_RETENTION = 0.9

/** FSRS 最大间隔天数默认值 */
export const DEFAULT_MAXIMUM_INTERVAL = 36500

/**
 * 复习设置 Schema 定义
 * 用于 Orca 插件设置界面
 */
export const reviewSettingsSchema = {
  "review.disableNotifications": {
    label: "关闭通知提醒",
    type: "boolean" as const,
    defaultValue: false,
    description: "开启后不显示任何 SRS 相关的通知提醒（评分、创建卡片等）"
  },
  "review.newCardsPerDay": {
    label: "每日新卡上限",
    type: "number" as const,
    defaultValue: DEFAULT_NEW_CARDS_PER_DAY,
    description: "每天最多学习的新卡数量"
  },
  "review.reviewCardsPerDay": {
    label: "每日复习卡上限",
    type: "number" as const,
    defaultValue: DEFAULT_REVIEW_CARDS_PER_DAY,
    description: "每天最多复习的旧卡数量"
  },
  "review.fsrsWeights": {
    label: "FSRS v6 算法权重",
    type: "string" as const,
    defaultValue: DEFAULT_FSRS_WEIGHTS,
    description: "FSRS v6 算法权重参数（21个逗号分隔的数字）。默认值为 ts-fsrs 官方默认值，如需调整请使用 FSRS 优化器计算"
  },
  "review.fsrsRequestRetention": {
    label: "FSRS 目标记忆保留率",
    type: "number" as const,
    defaultValue: DEFAULT_REQUEST_RETENTION,
    description: "期望的记忆保留率（0.7-0.99），值越高复习频率越高。推荐 0.9"
  },
  "review.fsrsMaximumInterval": {
    label: "FSRS 最大间隔天数",
    type: "number" as const,
    defaultValue: DEFAULT_MAXIMUM_INTERVAL,
    description: "卡片复习的最大间隔天数（默认 36500 天，约 100 年）"
  }
}

/**
 * 复习设置接口
 */
export interface ReviewSettings {
  disableNotifications: boolean
  newCardsPerDay: number
  reviewCardsPerDay: number
  fsrsWeights: string
  fsrsRequestRetention: number
  fsrsMaximumInterval: number
}

/**
 * 获取复习设置
 * 
 * @param pluginName - 插件名称
 * @returns 复习设置对象
 */
export function getReviewSettings(pluginName: string): ReviewSettings {
  const settings = orca.state.plugins[pluginName]?.settings
  return {
    disableNotifications: settings?.["review.disableNotifications"] ?? false,
    newCardsPerDay: settings?.["review.newCardsPerDay"] ?? DEFAULT_NEW_CARDS_PER_DAY,
    reviewCardsPerDay: settings?.["review.reviewCardsPerDay"] ?? DEFAULT_REVIEW_CARDS_PER_DAY,
    fsrsWeights: settings?.["review.fsrsWeights"] ?? DEFAULT_FSRS_WEIGHTS,
    fsrsRequestRetention: settings?.["review.fsrsRequestRetention"] ?? DEFAULT_REQUEST_RETENTION,
    fsrsMaximumInterval: settings?.["review.fsrsMaximumInterval"] ?? DEFAULT_MAXIMUM_INTERVAL
  }
}

/**
 * 解析 FSRS 权重字符串为数字数组
 * 
 * @param weightsStr - 逗号分隔的权重字符串
 * @returns 权重数组，如果解析失败返回 undefined
 */
export function parseFsrsWeights(weightsStr: string): number[] | undefined {
  try {
    const weights = weightsStr.split(",").map(s => parseFloat(s.trim()))
    // FSRS v6 需要 21 个权重参数（也兼容 19 个的 v5 格式，ts-fsrs 会自动填充）
    if (weights.length < 19 || weights.length > 21 || weights.some(w => isNaN(w))) {
      console.warn("[FSRS] 权重参数格式错误，需要 19-21 个有效数字")
      return undefined
    }
    return weights
  } catch {
    return undefined
  }
}

/**
 * 显示通知（如果未禁用）
 * 
 * @param pluginName - 插件名称
 * @param type - 通知类型
 * @param message - 通知消息
 * @param options - 通知选项
 */
export function showNotification(
  pluginName: string,
  type: "success" | "error" | "warn" | "info",
  message: string,
  options?: { title?: string }
): void {
  const settings = getReviewSettings(pluginName)
  if (!settings.disableNotifications) {
    orca.notify(type, message, options)
  }
}
