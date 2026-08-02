/**
 * 渲染器注册模块
 *
 * 负责注册自定义块渲染器和 inline 渲染器
 */

import SrsCardBlockRenderer from "../../components/SrsCardBlockRenderer"
import SrsReviewSessionRenderer from "../../components/SrsReviewSessionRenderer"
import SrsFlashcardHomeRenderer from "../../components/SrsFlashcardHomeRenderer"
import IncrementalReadingSessionRenderer from "../../components/IncrementalReadingSessionRenderer"
import IncrementalReadingManagerPanel from "../../components/IncrementalReadingManagerPanel"
import ClozeInlineRenderer from "../../components/ClozeInlineRenderer"
import DirectionInlineRenderer from "../../components/DirectionInlineRenderer"
import ChoiceCardBlockRenderer from "../../components/ChoiceCardBlockRenderer"
import ImageOcclusionBlockRenderer from "../../components/image-occlusion/ImageOcclusionBlockRenderer"
import ChapterQuizBlock from "../../components/incremental-reading/ChapterQuizBlock"
import ChapterQuizPanel from "../../panels/ChapterQuizPanel"
import { CHAPTER_QUIZ_PANEL_VIEW } from "../incremental-reading/chapterQuiz"
import { bindChapterQuizPanelRegistration } from "../incremental-reading/chapterQuizLive"

export function registerRenderers(pluginName: string): void {
  // 基本卡块渲染器
  orca.renderers.registerBlock(
    "srs.card",
    false,
    SrsCardBlockRenderer,
    [],
    false
  )

  // Cloze 卡块渲染器
  orca.renderers.registerBlock(
    "srs.cloze-card",
    false,
    SrsCardBlockRenderer,
    [],
    false
  )

  // Direction 卡块渲染器（复用 SrsCardBlockRenderer，内部路由到具体渲染器）
  orca.renderers.registerBlock(
    "srs.direction-card",
    false,
    SrsCardBlockRenderer,
    [],
    false
  )

  // Choice 卡块渲染器（选择题卡片）
  // Requirements: 8.1, 8.2
  orca.renderers.registerBlock(
    "srs.choice-card",
    false,
    ChoiceCardBlockRenderer,
    [],
    false
  )

  // 图片遮罩块：原图 + IO×N 徽章（asset 字段 src）
  orca.renderers.registerBlock(
    "srs.image-occlusion",
    false,
    ImageOcclusionBlockRenderer,
    ["src"],
    false
  )

  // 复习会话块渲染器（块渲染器模式）
  orca.renderers.registerBlock(
    "srs.review-session",
    false,
    SrsReviewSessionRenderer,
    [],
    false
  )

  // Flash Home 块渲染器（卡片浏览器和仪表板）
  // 需求: 3.1, 4.1
  orca.renderers.registerBlock(
    "srs.flashcard-home",
    false,
    SrsFlashcardHomeRenderer,
    [],
    false
  )

  // 渐进阅读会话块渲染器
  orca.renderers.registerBlock(
    "srs.ir-session",
    false,
    IncrementalReadingSessionRenderer,
    [],
    false
  )

  // 渐进阅读管理面板渲染器
  orca.renderers.registerBlock(
    "srs.ir-manager",
    false,
    IncrementalReadingManagerPanel,
    [],
    false
  )

  // 章末小测（一次性单选题，与日常 choice 卡独立）
  orca.renderers.registerBlock(
    "srs.chapter-quiz",
    false,
    ChapterQuizBlock,
    [],
    false
  )

  // 章末小测专注答题 Custom Panel（侧栏唯一完整答题 UI）
  bindChapterQuizPanelRegistration(
    orca.panels,
    CHAPTER_QUIZ_PANEL_VIEW,
    ChapterQuizPanel
  ).register()

  // Cloze inline 渲染器
  orca.renderers.registerInline(
    `${pluginName}.cloze`,
    false,
    ClozeInlineRenderer
  )

  // Direction inline 渲染器
  orca.renderers.registerInline(
    `${pluginName}.direction`,
    false,
    DirectionInlineRenderer
  )
}

export function unregisterRenderers(pluginName: string): void {
  orca.renderers.unregisterBlock("srs.card")
  orca.renderers.unregisterBlock("srs.cloze-card")
  orca.renderers.unregisterBlock("srs.direction-card")
  orca.renderers.unregisterBlock("srs.choice-card")
  orca.renderers.unregisterBlock("srs.image-occlusion")
  orca.renderers.unregisterBlock("srs.review-session")
  orca.renderers.unregisterBlock("srs.flashcard-home")
  orca.renderers.unregisterBlock("srs.ir-session")
  orca.renderers.unregisterBlock("srs.ir-manager")
  orca.renderers.unregisterBlock("srs.chapter-quiz")
  bindChapterQuizPanelRegistration(
    orca.panels,
    CHAPTER_QUIZ_PANEL_VIEW,
    ChapterQuizPanel
  ).unregister()
  orca.renderers.unregisterInline(`${pluginName}.cloze`)
  orca.renderers.unregisterInline(`${pluginName}.direction`)
}
