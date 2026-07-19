#!/usr/bin/env node
/**
 * Safe local deploy: stage into a temp dir, validate structure, then atomic replace.
 * Does not run by default after build. Target must be explicit.
 *
 * Usage:
 *   ORCA_PLUGIN_ROOT=/path/to/orca/plugins/orca-srs npm run deploy:local
 *   npm run deploy:local -- --target=/path/to/orca/plugins/orca-srs
 */

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  PLUGIN_FOLDER_NAME,
  copyDir,
  copyFile,
  ensureDir,
  fail,
  info,
  repoRoot,
  resolveDeployTarget,
  rmrf
} from "./lib/fs-utils.mjs"

const root = repoRoot()
const target = resolveDeployTarget()

const distIndex = path.join(root, "dist", "index.js")
const distCss = path.join(root, "dist", "style.css")
const icon = path.join(root, "icon.png")
if (!fs.existsSync(distIndex) || !fs.existsSync(distCss)) {
  fail("missing dist/index.js or dist/style.css — run npm run build first")
}
if (!fs.existsSync(icon)) {
  fail("missing icon.png at repo root")
}

const parent = path.dirname(target)
ensureDir(parent)

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "orca-srs-deploy-"))
const stagedPlugin = path.join(stage, PLUGIN_FOLDER_NAME)
const localStage = path.join(parent, `.${PLUGIN_FOLDER_NAME}.staging-${process.pid}-${Date.now()}`)
const backup = `${target}.prev-${process.pid}-${Date.now()}`

try {
  ensureDir(path.join(stagedPlugin, "dist"))
  copyFile(distIndex, path.join(stagedPlugin, "dist", "index.js"))
  copyFile(distCss, path.join(stagedPlugin, "dist", "style.css"))
  copyFile(icon, path.join(stagedPlugin, "icon.png"))
  copyFile(path.join(root, "package.json"), path.join(stagedPlugin, "package.json"))
  for (const name of ["README.md", "LICENSE", "CHANGELOG.md"]) {
    const src = path.join(root, name)
    if (fs.existsSync(src)) copyFile(src, path.join(stagedPlugin, name))
  }

  for (const rel of ["icon.png", "dist/index.js", "dist/style.css", "package.json"]) {
    if (!fs.existsSync(path.join(stagedPlugin, rel))) {
      fail(`stage validation failed: missing ${rel}`)
    }
  }

  if (fs.existsSync(localStage)) rmrf(localStage)
  copyDir(stagedPlugin, localStage)

  if (fs.existsSync(target)) {
    fs.renameSync(target, backup)
  }
  try {
    fs.renameSync(localStage, target)
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(target)) {
      fs.renameSync(backup, target)
    }
    throw error
  }

  if (fs.existsSync(backup)) rmrf(backup)
  info(`deployed to ${target}`)
} finally {
  rmrf(stage)
  if (fs.existsSync(localStage)) rmrf(localStage)
}
