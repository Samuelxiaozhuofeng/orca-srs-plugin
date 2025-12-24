/**
 * UI 组件注册模块
 *
 * 负责注册工具栏按钮、斜杠命令和顶部栏按钮
 * 
 * 注意：Orca 当前版本不支持自定义快捷键注册，
 * 当前编辑器工具栏仅保留"填空卡"入口，其它命令通过斜杠命令触发。
 */

import React from "react"

export function registerUIComponents(pluginName: string): void {
  // ============ 顶部栏按钮 (Headbar) ============
  
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

  // ============ AI 卡片斜杠命令 ============

  orca.slashCommands.registerSlashCommand(`${pluginName}.aiCard`, {
    icon: "ti ti-robot",
    group: "SRS",
    title: "AI 生成记忆卡片",
    command: `${pluginName}.makeAICard`
  })
}

export function unregisterUIComponents(pluginName: string): void {
  // 顶部栏按钮
  orca.headbar.unregisterHeadbarButton(`${pluginName}.reviewButton`)
  orca.headbar.unregisterHeadbarButton(`${pluginName}.flashHomeButton`)
  
  // 工具栏按钮
  orca.toolbar.unregisterToolbarButton(`${pluginName}.clozeButton`)
  
  // 斜杠命令
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.makeCard`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionForward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.directionBackward`)
  orca.slashCommands.unregisterSlashCommand(`${pluginName}.aiCard`)
}
