/**
 * Pure deploy target validation (Node stdlib). Used by deploy-local and tests.
 */

import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

export const PLUGIN_FOLDER_NAME = "orca-srs"

export function defaultRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
}

/**
 * @returns {{ ok: true, target: string } | { ok: false, error: string }}
 */
export function validateDeployTarget(rawTarget, options = {}) {
  const repo = options.repoRoot ? path.resolve(options.repoRoot) : defaultRepoRoot()
  const home = options.homeDir ? path.resolve(options.homeDir) : os.homedir()
  const targetRaw = String(rawTarget ?? "").trim()

  if (!targetRaw) {
    return {
      ok: false,
      error:
        "deploy target required. Set ORCA_PLUGIN_ROOT (or ORCA_SRS_DEPLOY_TARGET) " +
        "or pass --target=/absolute/path/to/orca/plugins/orca-srs"
    }
  }

  if (!path.isAbsolute(targetRaw)) {
    return { ok: false, error: `deploy target must be an absolute path, got: ${targetRaw}` }
  }

  const target = path.resolve(targetRaw)
  const base = path.basename(target)
  if (base !== PLUGIN_FOLDER_NAME) {
    return {
      ok: false,
      error: `deploy target basename must be exactly "${PLUGIN_FOLDER_NAME}", got "${base}"`
    }
  }

  const normalized = path.normalize(target)
  // Exact dangerous roots
  if (normalized === path.sep || normalized === path.parse(normalized).root) {
    return { ok: false, error: "refusing to deploy to filesystem root" }
  }
  if (normalized === path.resolve(home) || normalized === path.resolve(home) + path.sep) {
    return { ok: false, error: "refusing to deploy to user home directory" }
  }
  if (normalized === repo) {
    return { ok: false, error: "refusing to deploy to repository root" }
  }
  const repoParent = path.dirname(repo)
  if (normalized === repoParent) {
    return { ok: false, error: "refusing to deploy to repository parent directory" }
  }
  // plugins parent (…/plugins) without orca-srs leaf is already blocked by basename,
  // but also refuse if target IS a directory named plugins (edge)
  if (base === "plugins") {
    return { ok: false, error: "refusing to deploy to plugins directory itself" }
  }
  // Refuse when parent is plugins? Actually target is …/plugins/orca-srs which is correct.
  // Refuse when target path equals home subpath incorrectly? Skip.

  // Never allow target to be an ancestor of the repo (would clobber sources)
  const rel = path.relative(normalized, repo)
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    // repo is inside target
    return { ok: false, error: "refusing to deploy to a directory that contains the repository" }
  }

  return { ok: true, target: normalized }
}

export function parseDeployTargetArgv(argv = process.argv.slice(2), env = process.env) {
  let target = env.ORCA_PLUGIN_ROOT || env.ORCA_SRS_DEPLOY_TARGET || ""
  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length)
    }
  }
  const idx = argv.indexOf("--target")
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("-")) {
    target = argv[idx + 1]
  }
  return String(target ?? "").trim()
}
