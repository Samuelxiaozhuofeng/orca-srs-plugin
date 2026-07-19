#!/usr/bin/env node
/**
 * Stage a fixed top-level orca-srs/ release layout under release/orca-srs/.
 * Does not invent version; copies current package.json as-is.
 */

import fs from "node:fs"
import path from "node:path"
import {
  PLUGIN_FOLDER_NAME,
  copyDir,
  copyFile,
  ensureDir,
  fail,
  info,
  repoRoot,
  rmrf,
  run
} from "./lib/fs-utils.mjs"

const root = repoRoot()
const distIndex = path.join(root, "dist", "index.js")
const distCss = path.join(root, "dist", "style.css")
const icon = path.join(root, "icon.png")

run(process.execPath, [path.join(root, "scripts", "release-licenses.mjs")])

for (const [label, p] of [
  ["dist/index.js", distIndex],
  ["dist/style.css", distCss],
  ["icon.png", icon],
  ["README.md", path.join(root, "README.md")],
  ["LICENSE", path.join(root, "LICENSE")],
  ["CHANGELOG.md", path.join(root, "CHANGELOG.md")],
  ["package.json", path.join(root, "package.json")],
  ["THIRD_PARTY_NOTICES.md", path.join(root, "release", "THIRD_PARTY_NOTICES.md")]
]) {
  if (!fs.existsSync(p)) fail(`missing required source for stage: ${label}`)
}

const stageRoot = path.join(root, "release", PLUGIN_FOLDER_NAME)
rmrf(stageRoot)
ensureDir(path.join(stageRoot, "dist"))

copyFile(distIndex, path.join(stageRoot, "dist", "index.js"))
copyFile(distCss, path.join(stageRoot, "dist", "style.css"))
copyFile(icon, path.join(stageRoot, "icon.png"))
copyFile(path.join(root, "README.md"), path.join(stageRoot, "README.md"))
copyFile(path.join(root, "LICENSE"), path.join(stageRoot, "LICENSE"))
copyFile(path.join(root, "CHANGELOG.md"), path.join(stageRoot, "CHANGELOG.md"))
copyFile(path.join(root, "package.json"), path.join(stageRoot, "package.json"))
copyFile(
  path.join(root, "release", "THIRD_PARTY_NOTICES.md"),
  path.join(stageRoot, "THIRD_PARTY_NOTICES.md")
)
copyDir(
  path.join(root, "release", "third-party-licenses"),
  path.join(stageRoot, "third-party-licenses")
)

info(`staged ${stageRoot}`)
