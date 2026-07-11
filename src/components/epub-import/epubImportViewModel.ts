/**
 * Pure view-model helpers for EPUB import wizard (testable without React).
 */

import type { EpubChapter, EpubImportStatus, ImportEpubResult } from "../../importers/epub/types"

export type WizardStep =
  | "file"
  | "title"
  | "chapters"
  | "progress"
  | "result"
  | "ir_setup"

export function defaultBookTitle(metadataTitle: string, fileName: string): string {
  const fromMeta = (metadataTitle || "").trim()
  if (fromMeta && fromMeta !== "Unknown Title") return fromMeta
  return fileName.replace(/\.epub$/i, "").trim() || "未命名书籍"
}

export function toggleChapterKey(selected: string[], key: string): string[] {
  if (selected.includes(key)) {
    return selected.filter((k) => k !== key)
  }
  return [...selected, key]
}

export function selectAllChapterKeys(chapters: EpubChapter[]): string[] {
  return chapters.map((c) => c.key)
}

export function canProceedFromChapters(selectedKeys: string[]): boolean {
  return selectedKeys.length > 0
}

export function canProceedFromTitle(title: string): boolean {
  return title.trim().length > 0
}

export function resultSummary(result: ImportEpubResult): {
  headline: string
  detail: string
  canResume: boolean
  canCreateIR: boolean
} {
  if (result.kind === "already_exists") {
    return {
      headline: "已导入过同一 EPUB",
      detail: `已打开现有书籍 #${result.bookBlockId}`,
      canResume: result.status === "partial",
      canCreateIR: result.importedChapterIds.length > 0
    }
  }

  if (result.status === "complete") {
    return {
      headline: result.kind === "resumed" ? "继续导入完成" : "导入完成",
      detail: `成功导入 ${result.importedChapterIds.length} 章`,
      canResume: false,
      canCreateIR: result.importedChapterIds.length > 0
    }
  }

  return {
    headline: "导入未完成",
    detail: `成功 ${result.importedChapterIds.length}，失败 ${result.failedChapters.length}，未开始 ${result.pendingChapters.length}`,
    canResume: true,
    canCreateIR: result.importedChapterIds.length > 0
  }
}

export function schedulePreviewText(
  mode: "distributed" | "sequential",
  chapterCount: number,
  totalDays: number
): string {
  if (chapterCount <= 0) return "请至少选择 1 章"
  if (mode === "sequential") {
    return `顺序解锁：同时仅 1 章激活；完成或跳过当前章后才解锁下一章（共 ${chapterCount} 章）`
  }
  const interval = Math.max(1, Math.round(totalDays / Math.max(1, chapterCount)))
  return `分散排期：第 1 章今天到期，其余按约 ${totalDays} 天跨度分散（约每 ${interval} 天一章）`
}

export function isImportStatus(value: string): value is EpubImportStatus {
  return value === "importing" || value === "partial" || value === "complete"
}

export function accessibilityLabels() {
  return {
    fileInput: "选择 EPUB 文件",
    titleInput: "书名",
    chapterList: "章节列表",
    selectAll: "全选章节",
    clearAll: "清空选择",
    startImport: "开始导入",
    cancel: "取消",
    done: "完成",
    continueIR: "继续创建渐进阅读书籍",
    resume: "继续导入失败章节",
    modeDistributed: "分散排期",
    modeSequential: "顺序解锁"
  } as const
}
