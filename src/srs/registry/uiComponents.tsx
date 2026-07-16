/**
 * UI 组件注册模块
 *
 * 负责注册工具栏按钮、斜杠命令和顶部栏按钮
 *
 * 注意：Orca 当前版本不支持自定义快捷键注册，
 * 当前编辑器工具栏仅保留"填空卡"入口，其它命令通过斜杠命令触发。
 */

import React from "react"
import { AIDialogMount } from "../../components/AIDialogMount"
import { IRBookDialogMount } from "../../components/IRBookDialogMount"
import { EpubImportDialogMount } from "../../components/epub-import/EpubImportDialogMount"
import { WebImportDialogMount } from "../../components/web-import/WebImportDialogMount"

export function registerUIComponents(pluginName: string): void {
  orca.headbar.registerHeadbarButton(`${pluginName}.aiDialogMount`, () => (
    <AIDialogMount pluginName={pluginName} />
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.irBookDialogMount`, () => (
    <IRBookDialogMount pluginName={pluginName} />
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.epubImportDialogMount`, () => (
    <EpubImportDialogMount pluginName={pluginName} />
  ))

  orca.headbar.registerHeadbarButton(`${pluginName}.webImportDialogMount`, () => (
    <WebImportDialogMount pluginName={pluginName} />
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

  // ============ 工具栏按钮 ============

  orca.toolbar.registerToolbarButton(`${pluginName}.clozeButton`, {
    icon: "ti ti-braces",
    tooltip: "创建 Cloze 填空",
    command: `${pluginName}.createCloze`
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

  orca.toolbar.registerToolbarButton(`${pluginName}.importEpubButton`, {
    icon: "ti ti-book-upload",
    tooltip: "导入 EPUB",
    command: `${pluginName}.importEpub`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.importEpub`, {
    icon: "ti ti-book-upload",
    group: "SRS",
    title: "导入 EPUB",
    command: `${pluginName}.importEpub`
  })

  orca.toolbar.registerToolbarButton(`${pluginName}.importWebButton`, {
    icon: "ti ti-world-download",
    tooltip: "导入网页",
    command: `${pluginName}.importWeb`
  })

  orca.slashCommands.registerSlashCommand(`${pluginName}.importWeb`, {
    icon: "ti ti-world-download",
    group: "SRS",
    title: "导入网页",
    command: `${pluginName}.importWeb`
  })
}

export function unregisterUIComponents(pluginName: string): void {
  orca.headbar.unregisterHeadbarButton(`${pluginName}.aiDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.irBookDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.epubImportDialogMount`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.webImportDialogMount`)

  orca.headbar.unregisterHeadbarButton(`${pluginName}.reviewButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.flashHomeButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.incrementalReadingButton`)

  // 工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.clozeButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.importEpubButton`)
  orca.toolbar.unregisterToolbarButton(`${pluginName}.importWebButton`)

  // 斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.listCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionForward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionBackward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.aiCard`)
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
