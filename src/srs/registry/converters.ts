/**
 * 转换器注册模块
 *
 * 负责 plain -> SRS 的块和 inline 转换
 */

import type {
  BlockForConversion,
  Repr,
  ContentFragment
} from "../../orca.d.ts"

export function registerConverters(pluginName: string): void {
  // 基本卡转换器
  orca.converters.registerBlock(
    "plain",
    "srs.card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（无题目）"
      const back = repr.back || "（无答案）"
      return `[SRS 卡片]\n题目: ${front}\n答案: ${back}`
    }
  )

  // Cloze 卡转换器
  orca.converters.registerBlock(
    "plain",
    "srs.cloze-card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（无题目）"
      const back = repr.back || "（无答案）"
      return `[SRS 填空卡片]\n题目: ${front}\n答案: ${back}`
    }
  )

  // Direction 卡转换器
  orca.converters.registerBlock(
    "plain",
    "srs.direction-card",
    (blockContent: BlockForConversion, repr: Repr) => {
      const front = repr.front || "（左侧）"
      const back = repr.back || "（右侧）"
      const direction = repr.direction || "forward"
      const arrow = direction === "forward" ? "->" : direction === "backward" ? "<-" : "<->"
      return `[SRS 方向卡片]\n${front} ${arrow} ${back}`
    }
  )

  // 复习会话转换器
  orca.converters.registerBlock(
    "plain",
    "srs.review-session",
    () => "[SRS 复习会话面板块]"
  )

  // Flashcard Home 转换器
  orca.converters.registerBlock(
    "plain",
    "srs.flashcard-home",
    () => "[SRS Flashcard Home 面板块]"
  )

  // Cloze inline 转换器
  // 将 cloze fragment 转换为纯文本时，只返回填空内容本身
  orca.converters.registerInline(
    "plain",
    `${pluginName}.cloze`,
    (fragment: ContentFragment) => {
      // 只返回填空内容，不带 {cN::} 标记
      return fragment.v || ""
    }
  )

  // Direction inline 转换器
  orca.converters.registerInline(
    "plain",
    `${pluginName}.direction`,
    (fragment: ContentFragment) => {
      const direction = (fragment as any).direction || "forward"
      const symbol = direction === "forward" ? "->" : direction === "backward" ? "<-" : "<->"
      return ` ${symbol} `
    }
  )
}

export function unregisterConverters(pluginName: string): void {
  orca.converters.unregisterBlock("plain", "srs.card")
  orca.converters.unregisterBlock("plain", "srs.cloze-card")
  orca.converters.unregisterBlock("plain", "srs.direction-card")
  orca.converters.unregisterBlock("plain", "srs.review-session")
  orca.converters.unregisterBlock("plain", "srs.flashcard-home")
  orca.converters.unregisterInline("plain", `${pluginName}.cloze`)
  orca.converters.unregisterInline("plain", `${pluginName}.direction`)
}
