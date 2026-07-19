#!/usr/bin/env node
/** Strict gate for a production release. No readiness, worktree, or tag bypasses. */

import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import {
  PLUGIN_FOLDER_NAME,
  fail,
  info,
  readJson,
  repoRoot,
  sha256File
} from "./lib/fs-utils.mjs"
import {
  containsLocalHomePath,
  evaluateReadinessForReady,
  readJsonForGate,
  readTextForGate,
  validateStructuredEvidencePaths
} from "./lib/release-gates.mjs"

const root = repoRoot()
const expectedTagArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--expected-tag="))
const expectedTag = expectedTagArg?.slice("--expected-tag=".length)
  || process.env.GITHUB_REF_NAME

const verify = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "release-verify.mjs")],
  { cwd: root, stdio: "inherit" }
)
if (verify.status !== 0) {
  fail("release:verify failed; production release is not ready")
}

const pkg = readJson(path.join(root, "package.json"))
const version = typeof pkg.version === "string" ? pkg.version : ""
const tag = `v${version}`
const readinessPath = path.join(root, "release-evidence", "release-readiness.json")
const stageIndex = path.join(root, "release", PLUGIN_FOLDER_NAME, "dist", "index.js")
const errors = []

const readiness = readJsonForGate(
  readinessPath,
  "release-evidence/release-readiness.json",
  errors
)

let stagedDistSha256 = null
if (!fs.existsSync(stageIndex)) {
  errors.push("staged dist/index.js missing; cannot verify verifiedDistSha256")
} else {
  stagedDistSha256 = sha256File(stageIndex)
}

if (readiness !== null) {
  errors.push(
    ...evaluateReadinessForReady(readiness, {
      packageVersion: version,
      stagedDistSha256
    })
  )
  errors.push(...validateStructuredEvidencePaths(readiness, root))
}

scanEvidenceDirectory(path.join(root, "release-evidence"), errors)

const status = git(["status", "--porcelain=v1", "--untracked-files=all"])
if (status.trim()) {
  errors.push("git worktree is not clean")
}

const head = git(["rev-parse", "HEAD"]).trim()
let tagCommit = ""
try {
  tagCommit = git(["rev-parse", `${tag}^{commit}`]).trim()
} catch (error) {
  errors.push(`missing release tag ${tag}: ${errorMessage(error)}`)
}
if (tagCommit && tagCommit !== head) {
  errors.push(`release tag ${tag} does not point to HEAD`)
}
if (expectedTag && expectedTag !== tag) {
  errors.push(`expected tag ${JSON.stringify(expectedTag)} !== ${JSON.stringify(tag)}`)
}

if (errors.length) {
  for (const error of errors) console.error(`[release:ready] ERROR: ${error}`)
  fail(`${errors.length} production readiness error(s)`)
}

info(`release:ready OK (${tag})`)

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
}

function scanEvidenceDirectory(dir, errorsOut) {
  if (!fs.existsSync(dir)) {
    errorsOut.push("missing release-evidence directory")
    return
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanEvidenceDirectory(full, errorsOut)
      continue
    }
    if (!entry.isFile() || !/\.(json|md|txt)$/i.test(entry.name)) continue
    const rel = path.relative(root, full)
    const text = readTextForGate(full, rel, errorsOut)
    if (text === null) continue
    if (containsLocalHomePath(text)) {
      errorsOut.push(`evidence contains a local home path: ${rel}`)
    }
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
