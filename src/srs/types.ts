import type { State } from "ts-fsrs"
import type { DbId, ContentFragment } from "../orca.d.ts"

export type Grade = "again" | "hard" | "good" | "easy"

export type SrsState = {
  stability: number       // 记忆稳定度，越大代表遗忘速度越慢
  difficulty: number      // 记忆难度，1-10 越大越难
  interval: number        // 间隔天数（FSRS 计算出的 scheduled_days）
  due: Date               // 下次应复习的具体时间
  lastReviewed: Date | null // 上次复习时间，null 表示新卡未复习
  reps: number            // 已复习次数
  lapses: number          // 遗忘次数（Again 会增加）
  state?: State           // FSRS 内部状态（New/Learning/Review/Relearning）
}

export type ReviewCard = {
  id: DbId
  front: string
  back: string
  srs: SrsState
  isNew: boolean
  deck: string  // 修改：从 deck?: string 改为必填
  clozeNumber?: number  // 填空编号（仅 cloze 卡片使用）
  directionType?: "forward" | "backward"  // 方向类型（仅 direction 卡片使用）
  content?: ContentFragment[]  // 块内容（仅 cloze 卡片使用，用于渲染填空）
}

// Deck 统计信息
export type DeckInfo = {
  name: string              // deck 名称
  totalCount: number        // 总卡片数
  newCount: number          // 新卡数
  overdueCount: number      // 已到期数
  todayCount: number        // 今天到期数
  futureCount: number       // 未来到期数
}

// 全局统计
export type DeckStats = {
  decks: DeckInfo[]
  totalCards: number
  totalNew: number
  totalOverdue: number
}

export type TodayStats = {
  pendingCount: number
  todayCount: number
  newCount: number
  totalCount: number
}
