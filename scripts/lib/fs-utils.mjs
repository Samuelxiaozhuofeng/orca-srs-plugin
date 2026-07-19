/**
 * Shared helpers for release/deploy scripts (Node stdlib only).
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import {
  PLUGIN_FOLDER_NAME as PLUGIN_NAME,
  parseDeployTargetArgv,
  validateDeployTarget
} from "./deploy-target.mjs"

export const PLUGIN_FOLDER_NAME = PLUGIN_NAME

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

export function copyFile(src, dst) {
  ensureDir(path.dirname(dst))
  fs.copyFileSync(src, dst)
}

export function copyDir(src, dst) {
  ensureDir(dst)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else if (entry.isFile()) copyFile(from, to)
  }
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

export function sha256File(filePath) {
  const hash = createHash("sha256")
  hash.update(fs.readFileSync(filePath))
  return hash.digest("hex")
}

export function fileSize(filePath) {
  return fs.statSync(filePath).size
}

export function gzipByteLength(filePath) {
  return gzipSync(fs.readFileSync(filePath)).length
}

export function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd ?? repoRoot(),
    env: { ...process.env, ...opts.env }
  })
}

export function fail(message) {
  console.error(`[release] ${message}`)
  process.exit(1)
}

export function info(message) {
  console.log(`[release] ${message}`)
}

/**
 * Parse --target=/path or ORCA_PLUGIN_ROOT / ORCA_SRS_DEPLOY_TARGET.
 * Hard-fails on missing/relative/wrong basename/dangerous paths.
 */
export function resolveDeployTarget(argv = process.argv.slice(2)) {
  const raw = parseDeployTargetArgv(argv, process.env)
  const result = validateDeployTarget(raw, { repoRoot: repoRoot() })
  if (!result.ok) fail(result.error)
  return result.target
}

export { validateDeployTarget, parseDeployTargetArgv }
