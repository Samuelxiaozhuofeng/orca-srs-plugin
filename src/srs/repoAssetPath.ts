/**
 * 仓库 assets 路径解析（通用）。
 *
 * 对齐宿主内部 `getAssetPath$1`：`{repoDir}/assets/{fileName}`。
 * 注意：`orca.utils.getAssetPath` 在真机可能对 `./xxx.mp3` 恒等返回原值，
 * 不得单独依赖它解析仓库相对资源。
 *
 * 供 Image Occlusion 与 TTS 播放共用，避免复制漂移。
 */

/**
 * 解析仓库 assets 目录下的相对资源为绝对文件系统路径。
 * 例：`image-xxx.png` → `/Users/.../orca/repos/{id}/assets/image-xxx.png`
 */
export function resolveRepoAssetAbsolutePath(relativeName: string): string {
  const sep = "/"
  const name = String(relativeName ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^assets\//, "")
  let repoDir = ""
  try {
    if (typeof orca !== "undefined") {
      const state = orca.state as {
        repoDir?: string
        dataDir?: string
        repo?: string
      }
      repoDir =
        (typeof state.repoDir === "string" && state.repoDir) ||
        (typeof state.dataDir === "string" && typeof state.repo === "string"
          ? `${state.dataDir.replace(/[\\/]+$/, "")}${sep}repos${sep}${state.repo}`
          : "")
    }
  } catch (error) {
    console.warn("[repoAssetPath] 读取 repoDir 失败:", error)
  }
  if (!repoDir) {
    throw new Error(
      "无法解析仓库 assets 路径：orca.state.repoDir / dataDir+repo 不可用"
    )
  }
  const base = repoDir.replace(/[\\/]+$/, "")
  if (!name) return `${base}${sep}assets${sep}`
  return `${base}${sep}assets${sep}${name}`
}

/**
 * 将绝对路径转为可用的 file:// URL（与宿主 image/audio 块渲染一致）。
 * 已有 file/http(s) 前缀则原样返回。
 */
export function absolutePathToFileUrl(absPath: string): string {
  const p = String(absPath ?? "").trim()
  if (!p) return ""
  if (/^(file|https?):/i.test(p)) return p
  const normalized = p.replace(/\\/g, "/")
  const withRoot = normalized.startsWith("/") ? normalized : `/${normalized}`
  const encoded = withRoot
    .split("/")
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join("/")
  return `file://${encoded}`
}

/**
 * 解析展示/播放用 URL：
 * - `./name.mp3` / `assets/name.mp3` / 裸文件名 → `{repoDir}/assets/...` → `file://...`
 * - 绝对路径 → `file://...`
 * - http(s)/data/blob/file 原样
 *
 * repoDir 不可用时抛错，禁止生成 `file:///./xxx` 假 URL。
 */
export function resolveRepoAssetDisplayUrl(src: string): string {
  if (!src) return ""
  const trimmed = src.trim()
  if (/^(https?:|data:|blob:|file:)/i.test(trimmed)) {
    return trimmed
  }

  const isRepoRelative =
    trimmed.startsWith("./") ||
    trimmed.startsWith("assets/") ||
    (!trimmed.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(trimmed))

  let fsPath = trimmed
  if (isRepoRelative) {
    fsPath = resolveRepoAssetAbsolutePath(trimmed)
  }

  if (
    fsPath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(fsPath) ||
    fsPath.includes("/assets/") ||
    fsPath.includes("\\assets\\")
  ) {
    return absolutePathToFileUrl(fsPath)
  }

  try {
    if (typeof orca !== "undefined" && orca.utils?.getAssetPath) {
      const via = orca.utils.getAssetPath(fsPath)
      if (via && via !== fsPath && /^(file|https?):/i.test(via)) return via
      if (via && (via.startsWith("/") || /^[A-Za-z]:[\\/]/.test(via))) {
        return absolutePathToFileUrl(via)
      }
    }
  } catch (error) {
    console.warn("[repoAssetPath] getAssetPath 失败:", error)
  }

  throw new Error(
    `无法将资源路径解析为可访问 URL: ${trimmed.slice(0, 120)}`
  )
}

/** @deprecated 别名：Image Occlusion 历史命名，语义同 resolveRepoAssetDisplayUrl */
export const resolveImageDisplayUrl = resolveRepoAssetDisplayUrl
