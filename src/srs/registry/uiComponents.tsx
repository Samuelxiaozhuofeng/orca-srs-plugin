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

  // 复习按钮 - 开始复习会话
  orca.headbar.registerHeadbarButton(`${pluginName}.reviewButton`, () => (
    <orca.components.Button
      variant="plain"
      tabIndex={-1}
      onClick={() => orca.commands.invokeCommand(`${pluginName}.openOldReviewPanel`)}
      title="开始闪卡复习"
    >
      <i className="ti ti-brain orca-headbar-icon" />
    </orca.components.Button>
  ))

  // Flash Home 按钮 - 打开闪卡主页
  orca.headbar.registerHeadbarButton(`${pluginName}.flashHomeButton`, () => (
    <orca.components.Button
      variant="plain"
      tabIndex={-1}
      onClick={() => orca.commands.invokeCommand(`${pluginName}.openFlashcardHome`)}
      title="打开 Flash Home"
    >
      <i className="ti ti-home orca-headbar-icon" />
    </orca.components.Button>
  ))

  // 渐进阅读按钮 - 打开渐进阅读面板
  orca.headbar.registerHeadbarButton(`${pluginName}.incrementalReadingButton`, () => (
    <orca.components.Button
      variant="plain"
      tabIndex={-1}
      onClick={() => orca.commands.invokeCommand(`${pluginName}.startIncrementalReadingSession`)}
      title="打开渐进阅读"
    >
      <i className="ti ti-book-2 orca-headbar-icon" />
    </orca.components.Button>
  ))

  // AI 提示词库面板（独立于原生设置页）
  orca.headbar.registerHeadbarButton(`${pluginName}.aiPromptLibraryButton`, () => (
    <orca.components.Button
      variant="plain"
      tabIndex={-1}
      onClick={() => orca.commands.invokeCommand(`${pluginName}.manageAIToolbarPrompts`)}
      title="打开 AI 提示词库"
    >
      <i className="ti ti-books orca-headbar-icon" />
    </orca.components.Button>
  ))

  // AI / Firecrawl 服务设置（独立于原生设置页）
  orca.headbar.registerHeadbarButton(`${pluginName}.aiServiceSettingsButton`, () => (
    <orca.components.Button
      variant="plain"
      tabIndex={-1}
      onClick={() =>
        orca.commands.invokeCommand(`${pluginName}.openAIServiceSettings`)
      }
      title="AI / Firecrawl 服务设置"
    >
      <i className="ti ti-plug-connected orca-headbar-icon" />
    </orca.components.Button>
  ))

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
    title: "转换为记忆卡片",
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
    title: "AI 生成闪卡",
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

  // ============ 渐进阅读斜杠命令 ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.ir`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "IR：创建 Topic 卡片",
    command: `${pluginName}.createTopicCard`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.incrementalReading`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "渐进阅读",
    command: `${pluginName}.startIncrementalReadingSession`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.ir_record`, {
    icon: "ti ti-bookmark",
    group: "SRS",
    title: "ir_record",
    command: `${pluginName}.irRecordProgress`
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

  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiQuickInteractMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiPromptManagerMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiServiceSettingsMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.irBookDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.epubImportDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.webImportDialogMount`)

  orca.headbar.unregisterHeadbarButton(`${pluginName}.reviewButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.flashHomeButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.incrementalReadingButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiPromptLibraryButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiServiceSettingsButton`)

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
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importEpub`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.importWeb`)
}
