/**
 * UI 组件注册模块
 *
 * 负责注册工具栏按钮、斜杠命令和顶部栏按钮
 *
 * 注意：Orca 当前版本不支持自定义快捷键注册，
 * 当前编辑器工具栏保留「填空卡 + AI 快捷交互」入口，其它命令通过斜杠命令触发。
 */

import { AIDialogMount } from "../../components/AIDialogMount"
import { AIQuickInteractMount } from "../../components/AIQuickInteractMount"
import { AIPromptManagerMount } from "../../components/AIPromptManagerMount"
import { AIServiceSettingsMount } from "../../components/AIServiceSettingsMount"
import { IRBookDialogMount } from "../../components/IRBookDialogMount"
import { EpubImportDialogMount } from "../../components/epub-import/EpubImportDialogMount"
import { WebImportDialogMount } from "../../components/web-import/WebImportDialogMount"
import { ImageOcclusionEditorMount } from "../../components/image-occlusion/ImageOcclusionEditorMount"
import SrsErrorBoundary from "../../components/SrsErrorBoundary"
import { getToolbarAIPrompts } from "../ai/aiToolbarPromptStore"
import { buildToolbarActionIconClass } from "../settings/irSelectionToolbarSettings"
import {
  HEADBAR_MOUNT_SUFFIXES,
  LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES,
  VISIBLE_HEADBAR_BUTTONS,
  headbarButtonId
} from "./headbarButtons"

const React = window.React

export function registerUIComponents(pluginName: string): void {
  orca.headbar.registerHeadbarButton(`${pluginName}.aiDialogMount`, () => (
    <SrsErrorBoundary componentName="AI 生成闪卡">
      <AIDialogMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.aiQuickInteractMount`, () => (
    <SrsErrorBoundary componentName="AI 快捷交互">
      <AIQuickInteractMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.aiPromptManagerMount`, () => (
    <SrsErrorBoundary componentName="管理 AI 提示词">
      <AIPromptManagerMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.aiServiceSettingsMount`, () => (
    <SrsErrorBoundary componentName="AI 服务设置">
      <AIServiceSettingsMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.irBookDialogMount`, () => (
    <SrsErrorBoundary componentName="Book IR 创建">
      <IRBookDialogMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.epubImportDialogMount`, () => (
    <SrsErrorBoundary componentName="EPUB 导入">
      <EpubImportDialogMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.webImportDialogMount`, () => (
    <SrsErrorBoundary componentName="网页导入">
      <WebImportDialogMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.imageOcclusionEditorMount`, () => (
    <SrsErrorBoundary componentName="图片遮罩编辑器">
      <ImageOcclusionEditorMount pluginName={pluginName} />
    </SrsErrorBoundary>
  ))

  // 唯一可见业务入口：今日学习（命令 ID 仍为 openFlashcardHome，兼容旧调用）
  for (const btn of VISIBLE_HEADBAR_BUTTONS) {
    const buttonId = headbarButtonId(pluginName, btn.idSuffix)
    const commandId = `${pluginName}.${btn.commandSuffix}`
    orca.headbar.registerHeadbarButton(buttonId, () => (
      <orca.components.Button
        variant="plain"
        tabIndex={-1}
        onClick={() => orca.commands.invokeCommand(commandId)}
        title={btn.title}
      >
        <i className={`${btn.iconClass} orca-headbar-icon`} />
      </orca.components.Button>
    ))
  }
  // ============ 工具栏按钮 ============
  // icon = Tabler + 唯一 orca-srs-stb-* marker；过滤/分类只认 marker，避免误伤其它插件同图标。

  orca.toolbar.registerToolbarButton(`${pluginName}.extractButton`, {
    icon: buildToolbarActionIconClass("extract"),
    tooltip: "摘录 (Alt+X)",
    command: `${pluginName}.createExtract`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.clozeButton`, {
    icon: buildToolbarActionIconClass("cloze"),
    tooltip: "创建 Cloze 填空",
    command: `${pluginName}.createCloze`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.explainButton`, {
    icon: buildToolbarActionIconClass("explain"),
    tooltip: "一键解释（渐进阅读）",
    command: `${pluginName}.irBlockExplainFromSelection`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.ttsFromSelection`, {
    icon: buildToolbarActionIconClass("tts"),
    tooltip: "选区生成语音 (Azure TTS)",
    command: `${pluginName}.ttsFromSelection`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.aiQuickInteract`, {
    icon: buildToolbarActionIconClass("aiMenu"),
    tooltip: "AI 快捷交互",
    menu: (close) => {
      const MenuText = orca.components.MenuText
      const prompts = getToolbarAIPrompts(pluginName)
      return (
        <>
          {prompts.map((p) => (
            <MenuText
              key={p.id}
              title={p.label}
              onClick={() => {
                close()
                void orca.commands.invokeEditorCommand(
                  `${pluginName}.aiQuickInteract`,
                  null,
                  p.id
                )
              }}
            />
          ))}
          <MenuText
            title="提示词库…"
            onClick={() => {
              close()
              void orca.commands.invokeCommand(
                `${pluginName}.manageAIToolbarPrompts`
              )
            }}
          />
          <MenuText
            title="自定义提示词…"
            onClick={() => {
              close()
              void orca.commands.invokeEditorCommand(
                `${pluginName}.aiQuickInteract`,
                null,
                "__custom__"
              )
            }}
          />
        </>
      )
    }
  })

  // ============ 斜杠命令 ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.makeCard`, {
    icon: "ti ti-card-plus",
    group: "SRS",
    title: "转换为记忆卡",
    command: `${pluginName}.makeCardFromBlock`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.choiceCard`, {
    icon: "ti ti-list-check",
    group: "SRS",
    title: "创建选择题",
    command: `${pluginName}.createChoiceCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.listCard`, {
    icon: "ti ti-list-details",
    group: "SRS",
    title: "列表卡（子块作为条目）",
    command: `${pluginName}.createListCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.directionForward`, {
    icon: "ti ti-arrow-right",
    group: "SRS",
    title: "创建正向方向卡 → (光标位置分隔问答)",
    command: `${pluginName}.createDirectionForward`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.directionBackward`, {
    icon: "ti ti-arrow-left",
    group: "SRS",
    title: "创建反向方向卡 ← (光标位置分隔问答)",
    command: `${pluginName}.createDirectionBackward`
  })

  // 图片遮罩：斜杠 /io
  orca.slashCommands.registerSlashCommand(`${pluginName}.io`, {
    icon: "ti ti-photo-shield",
    group: "SRS",
    title: "图片遮罩（IO）",
    command: `${pluginName}.openImageOcclusionEditor`
  })

  // ============ AI 卡片斜杠命令（仅一条可见体验） ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.aiCard`, {
    icon: "ti ti-cards",
    group: "SRS",
    title: "AI 生成记忆卡",
    command: `${pluginName}.makeAICard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.quickBasicCard`, {
    icon: "ti ti-bolt",
    group: "SRS",
    title: "快捷问答卡（选中即生成，下方预览）",
    command: `${pluginName}.quickBasicCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.quickClozeCard`, {
    icon: "ti ti-bolt",
    group: "SRS",
    title: "快捷填空卡（选中即生成，下方预览）",
    command: `${pluginName}.quickClozeCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.quickChoiceCard`, {
    icon: "ti ti-bolt",
    group: "SRS",
    title: "快捷选择题（选中即生成，下方预览）",
    command: `${pluginName}.quickChoiceCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.manageAIPrompts`, {
    icon: "ti ti-books",
    group: "SRS",
    title: "打开 AI 提示词库",
    command: `${pluginName}.manageAIToolbarPrompts`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.openAIServiceSettings`, {
    icon: "ti ti-plug-connected",
    group: "SRS",
    title: "AI / Firecrawl 服务设置",
    command: `${pluginName}.openAIServiceSettings`
  })

  // ============ 阅读 / 今日学习斜杠命令 ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.ir`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "创建阅读材料（主题）",
    command: `${pluginName}.createTopicCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.gotitQuiz`, {
    icon: "ti ti-question-mark",
    group: "SRS",
    title: "GOTIT?",
    command: `${pluginName}.gotitQuiz`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.incrementalReading`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "打开阅读工作区",
    command: `${pluginName}.startIncrementalReadingSession`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.ir_record`, {
    icon: "ti ti-bookmark",
    group: "SRS",
    title: "记录阅读进度",
    command: `${pluginName}.irRecordProgress`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.todayLearning`, {
    icon: "ti ti-calendar-check",
    group: "SRS",
    title: "今日学习",
    command: `${pluginName}.openFlashcardHome`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.importEpub`, {
    icon: "ti ti-book-upload",
    group: "SRS",
    title: "导入 EPUB",
    command: `${pluginName}.importEpub`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.importWeb`, {
    icon: "ti ti-world-download",
    group: "SRS",
    title: "导入网页",
    command: `${pluginName}.importWeb`
  })
}

/** AI 后台任务取消的有界等待上限；超时后卸载继续，错误保持可见 */
export const AI_BACKGROUND_CANCEL_TIMEOUT_MS = 3000

export async function unregisterUIComponents(
  pluginName: string,
  options?: { aiCancelTimeoutMs?: number }
): Promise<void> {
  const aiCancelTimeoutMs =
    options?.aiCancelTimeoutMs ?? AI_BACKGROUND_CANCEL_TIMEOUT_MS

  // 中止后台 AI 快捷任务；未「保留」的 ready 预览默认删除（离开/卸载不保存）。
  // 先启动取消（与下方同步注销并行），函数末尾有界等待其完成，
  // 使 unload 序列真正 await 到该清理；失败/超时抛出进入 cleanupErrors。
  let cancelTimedOut = false
  const cancelAIJobs = import("../ai/aiQuickInteractJobs").then((m) =>
    m.cancelAllBackgroundQuickJobs()
  )
  cancelAIJobs.catch((error) => {
    // 未超时的失败已由下方 await 抛给 unload 序列记录；这里只兜底超时后的迟到失败
    if (!cancelTimedOut) return
    console.error(
      `[${pluginName}] AI 后台任务取消在卸载超时放弃等待后失败:`,
      error
    )
  })

  for (const suffix of HEADBAR_MOUNT_SUFFIXES) {
    orca.headbar.unregisterHeadbarButton(headbarButtonId(pluginName, suffix))
  }
  for (const btn of VISIBLE_HEADBAR_BUTTONS) {
    orca.headbar.unregisterHeadbarButton(
      headbarButtonId(pluginName, btn.idSuffix)
    )
  }
  // 兼容旧版本卸载：清理历史可见 Headbar 按钮 id
  for (const suffix of LEGACY_VISIBLE_HEADBAR_BUTTON_SUFFIXES) {
    orca.headbar.unregisterHeadbarButton(headbarButtonId(pluginName, suffix))
  }

  // 工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.extractButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.clozeButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.explainButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.ttsFromSelection`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.aiQuickInteract`)

  // 斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.quickBasicCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.quickClozeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.quickChoiceCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.choiceCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.listCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionForward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionBackward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.io`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.aiCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.manageAIPrompts`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.openAIServiceSettings`)
  // Legacy slash id (if previously registered on older builds)
  try {
    orca.slashCommands.unregisterSlashCommand(`${pluginName}.interactiveAI`)
  } catch (error) {
    console.warn(`[${pluginName}] 清理旧 AI 斜杠命令失败:`, error)
  }
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.ir`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.gotitQuiz`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.incrementalReading`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.ir_record`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.todayLearning`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importEpub`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importWeb`)

  // 有界等待 AI 后台任务取消：卸载时序确定；超时/失败向上抛出，
  // 由 unload 序列记入 cleanupErrors（默认 console.error，可见不吞错）
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      cancelAIJobs,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          cancelTimedOut = true
          reject(
            new Error(
              `取消 AI 后台任务超时（>${aiCancelTimeoutMs}ms），任务可能仍在后台执行`
            )
          )
        }, aiCancelTimeoutMs)
      })
    ])
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}
