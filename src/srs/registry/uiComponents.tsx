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
import SrsErrorBoundary from "../../components/SrsErrorBoundary"
import { getToolbarAIPrompts } from "../ai/aiToolbarPromptStore"
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

  orca.toolbar.registerToolbarButton(`${pluginName}.clozeButton`, {
    icon: "ti ti-braces",
    tooltip: "创建 Cloze 填空",
    command: `${pluginName}.createCloze`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.aiQuickInteract`, {
    icon: "ti ti-sparkles",
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

  // ============ AI 卡片斜杠命令（仅一条可见体验） ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.aiCard`, {
    icon: "ti ti-cards",
    group: "SRS",
    title: "AI 生成记忆卡",
    command: `${pluginName}.makeAICard`
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

export function unregisterUIComponents(pluginName: string): void {
  // 中止后台 AI 快捷任务；未「保留」的 ready 预览默认删除（离开/卸载不保存）
  void import("../ai/aiQuickInteractJobs")
    .then((m) => m.cancelAllBackgroundQuickJobs())
    .catch((error) => {
      console.warn(`[${pluginName}] 清理 AI 后台任务失败:`, error)
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
  orca.toolbar.unregisterToolbarButton(`${pluginName}.clozeButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.aiQuickInteract`)

  // 斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.listCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionForward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionBackward`)
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
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.incrementalReading`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.ir_record`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.todayLearning`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importEpub`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importWeb`)
}
