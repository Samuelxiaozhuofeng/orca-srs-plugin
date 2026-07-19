#!/usr/bin/env node
/**
 * Deterministic store ZIP of release/orca-srs (top-level orca-srs/).
 * Always runs strict release:ready first.
 * Fixed file order + DOS timestamps for identical SHA-256 across runs.
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  PLUGIN_FOLDER_NAME,
  fail,
  info,
  readJson,
  repoRoot,
  rmrf,
  sha256File
} from "./lib/fs-utils.mjs"

const root = repoRoot()
const stageRoot = path.join(root, "release", PLUGIN_FOLDER_NAME)
if (!fs.existsSync(stageRoot)) {
  fail("missing release/orca-srs — run npm run release:stage first")
}

const ready = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "release-ready.mjs")],
  { cwd: root, stdio: "inherit" }
)
if (ready.status !== 0) {
  fail("release:ready failed; refusing to zip")
}

const pkg = readJson(path.join(stageRoot, "package.json"))
const version = typeof pkg.version === "string" ? pkg.version : "unknown"
if (version === "0.0.0") {
  fail('package.json version is still "0.0.0" — cannot create release zip')
}

const outName = `orca-srs-${version}.zip`
const outPath = path.join(root, "release", outName)
for (const name of fs.readdirSync(path.join(root, "release"))) {
  if (/^orca-srs-.*\.zip$/.test(name)) {
    rmrf(path.join(root, "release", name))
  }
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function collectFiles(dir, baseRel = PLUGIN_FOLDER_NAME) {
  const out = []
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = `${baseRel}/${entry.name}`.replace(/\\/g, "/")
    if (entry.isDirectory()) out.push(...collectFiles(full, rel))
    else if (entry.isFile()) out.push({ full, rel })
  }
  return out
}

// Fixed DOS date/time for determinism (2026-01-01 00:00:00)
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

const files = collectFiles(stageRoot)
const central = []
let offset = 0
const chunks = []

for (const file of files) {
  const data = fs.readFileSync(file.full)
  const nameBuf = Buffer.from(file.rel, "utf8")
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0, 6) // flags
  local.writeUInt16LE(0, 8) // store
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  chunks.push(local, nameBuf, data)

  const cen = Buffer.alloc(46)
  cen.writeUInt32LE(0x02014b50, 0)
  cen.writeUInt16LE(20, 4)
  cen.writeUInt16LE(20, 6)
  cen.writeUInt16LE(0, 8)
  cen.writeUInt16LE(0, 10)
  cen.writeUInt16LE(DOS_TIME, 12)
  cen.writeUInt16LE(DOS_DATE, 14)
  cen.writeUInt32LE(crc, 16)
  cen.writeUInt32LE(data.length, 20)
  cen.writeUInt32LE(data.length, 24)
  cen.writeUInt16LE(nameBuf.length, 28)
  cen.writeUInt16LE(0, 30)
  cen.writeUInt16LE(0, 32)
  cen.writeUInt16LE(0, 34)
  cen.writeUInt16LE(0, 36)
  cen.writeUInt32LE(0, 38)
  cen.writeUInt32LE(offset, 42)
  central.push(cen, nameBuf)
  offset += local.length + nameBuf.length + data.length
}

const centralStart = offset
const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(0, 4)
end.writeUInt16LE(0, 6)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(centralStart, 16)
end.writeUInt16LE(0, 20)

fs.writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, end]))
info(`wrote ${outPath}`)

const sums = [
  [outName, outPath],
  [`${PLUGIN_FOLDER_NAME}/dist/index.js`, path.join(stageRoot, "dist", "index.js")],
  [`${PLUGIN_FOLDER_NAME}/dist/style.css`, path.join(stageRoot, "dist", "style.css")],
  [`${PLUGIN_FOLDER_NAME}/icon.png`, path.join(stageRoot, "icon.png")]
]
  .map(([name, file]) => `${sha256File(file)}  ${name}`)
  .join("\n")
fs.writeFileSync(path.join(root, "release", "SHA256SUMS.txt"), `${sums}\n`)
info("wrote release/SHA256SUMS.txt")
