#!/usr/bin/env node
/**
 * Verify staged release package under release/orca-srs/.
 *
 * Flags:
 *   --allow-placeholder-version     only exempts package.json version === "0.0.0"
 *   --allow-incomplete-readiness    only exempts readiness No-Go (go/orcaRuntimeVerified/blockers);
 *                                   does NOT exempt missing/invalid readiness JSON, version mismatch,
 *                                   security, license, or any other release error
 */

import fs from "node:fs"
import path from "node:path"
import {
  PLUGIN_FOLDER_NAME,
  fail,
  fileSize,
  gzipByteLength,
  info,
  repoRoot,
  sha256File
} from "./lib/fs-utils.mjs"
import {
  checkChangelogHeading,
  collectIdenticalReleaseVersions,
  evaluateReadinessForVerify,
  readJsonForGate,
  readTextForGate,
  scanStagedTextContent
} from "./lib/release-gates.mjs"

const argv = process.argv.slice(2)
const allowPlaceholderVersion = argv.includes("--allow-placeholder-version")
const allowIncompleteReadiness = argv.includes("--allow-incomplete-readiness")

const root = repoRoot()
const stageRoot = path.join(root, "release", PLUGIN_FOLDER_NAME)
const readinessPath = path.join(root, "release-evidence", "release-readiness.json")
const rootPackagePath = path.join(root, "package.json")
const lockPath = path.join(root, "package-lock.json")

if (!fs.existsSync(stageRoot)) {
  fail("missing release/orca-srs — run npm run release:stage first")
}

const required = [
  "icon.png",
  "dist/index.js",
  "dist/style.css",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json"
]

const errors = []
const warnings = []
const TEXT_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".md",
  ".json",
  ".txt",
  ".html",
  ".map",
  ".ts",
  ".tsx"
])

for (const rel of required) {
  const full = path.join(stageRoot, rel)
  if (!fs.existsSync(full)) errors.push(`missing required file: ${rel}`)
}

function walk(dir, relBase = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["node_modules", "src", "coverage", ".git"].includes(entry.name)) {
        errors.push(`disallowed directory in stage: ${rel}`)
      } else {
        walk(full, rel)
      }
      continue
    }
    if (entry.name.endsWith(".map")) {
      errors.push(`source map present: ${rel}`)
    }
    if (/\.(env|pem|key)$/i.test(entry.name)) {
      errors.push(`secret-like file present: ${rel}`)
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (TEXT_EXTS.has(ext) || entry.name === "LICENSE") {
      scanTextFile(full, rel)
    }
  }
}

function scanTextFile(full, rel) {
  const text = readTextForGate(full, rel, errors)
  if (text === null) return
  const scanned = scanStagedTextContent(text, rel)
  errors.push(...scanned.errors)
  warnings.push(...scanned.warnings)
}

walk(stageRoot)

const thirdPartyLicenseDir = path.join(stageRoot, "third-party-licenses")
if (
  !fs.existsSync(thirdPartyLicenseDir)
  || fs.readdirSync(thirdPartyLicenseDir).filter((name) => name.endsWith(".txt")).length === 0
) {
  errors.push("missing third-party license texts")
}

const indexJs = path.join(stageRoot, "dist", "index.js")
const styleCss = path.join(stageRoot, "dist", "style.css")
if (fs.existsSync(indexJs)) {
  const raw = fileSize(indexJs)
  const gz = gzipByteLength(indexJs)
  info(`dist/index.js raw=${raw} gzip=${gz}`)
  if (gz > 350 * 1024) {
    warnings.push(
      `dist/index.js gzip ${gz} exceeds 350 KiB budget (require justification before release)`
    )
  }
}

// --- Version quartet: root, lock top, lock packages[""], stage — all strict + identical ---
const rootPackage = fs.existsSync(rootPackagePath)
  ? readJsonForGate(rootPackagePath, "root package.json", errors)
  : (errors.push("missing root package.json"), null)
const lock = fs.existsSync(lockPath)
  ? readJsonForGate(lockPath, "package-lock.json", errors)
  : (errors.push("missing package-lock.json"), null)
const stagePkgPath = path.join(stageRoot, "package.json")
const stagePackage = fs.existsSync(stagePkgPath)
  ? readJsonForGate(stagePkgPath, "stage package.json", errors)
  : (errors.push("missing stage package.json"), null)

const rootObj =
  rootPackage && typeof rootPackage === "object" && !Array.isArray(rootPackage)
    ? /** @type {Record<string, unknown>} */ (rootPackage)
    : null
const lockObj =
  lock && typeof lock === "object" && !Array.isArray(lock)
    ? /** @type {Record<string, unknown>} */ (lock)
    : null
const stageObj =
  stagePackage && typeof stagePackage === "object" && !Array.isArray(stagePackage)
    ? /** @type {Record<string, unknown>} */ (stagePackage)
    : null

if (rootPackage !== null && !rootObj) {
  errors.push("root package.json must be a non-null object")
}
if (lock !== null && !lockObj) {
  errors.push("package-lock.json must be a non-null object")
}
if (stagePackage !== null && !stageObj) {
  errors.push("stage package.json must be a non-null object")
}

const lockRoot =
  lockObj && lockObj.packages && typeof lockObj.packages === "object"
    ? /** @type {Record<string, unknown>} */ (lockObj.packages)[""]
    : undefined
const lockRootObj =
  lockRoot && typeof lockRoot === "object" && !Array.isArray(lockRoot)
    ? /** @type {Record<string, unknown>} */ (lockRoot)
    : null

const releaseVersion = collectIdenticalReleaseVersions(
  {
    rootVersion: rootObj?.version,
    lockVersion: lockObj?.version,
    lockPackagesVersion: lockRootObj?.version,
    stageVersion: stageObj?.version
  },
  errors
)

if (rootObj && rootObj.name !== PLUGIN_FOLDER_NAME) {
  errors.push(
    `root package name ${JSON.stringify(rootObj.name)} !== ${JSON.stringify(PLUGIN_FOLDER_NAME)}`
  )
}
if (
  lockObj
  && (lockObj.name !== PLUGIN_FOLDER_NAME || lockRootObj?.name !== PLUGIN_FOLDER_NAME)
) {
  errors.push("package-lock.json package names do not match orca-srs")
}
if (stageObj && stageObj.name !== PLUGIN_FOLDER_NAME) {
  errors.push(
    `staged package name ${JSON.stringify(stageObj.name)} !== ${JSON.stringify(PLUGIN_FOLDER_NAME)}`
  )
}

if (releaseVersion === "0.0.0") {
  if (allowPlaceholderVersion) {
    warnings.push(
      'package.json version is "0.0.0" (allowed by --allow-placeholder-version)'
    )
  } else {
    errors.push(
      'package.json version is still "0.0.0" — maintainer must set first release version before zip'
    )
  }
}

if (stageObj) {
  const engines =
    stageObj.engines && typeof stageObj.engines === "object" && !Array.isArray(stageObj.engines)
      ? /** @type {Record<string, unknown>} */ (stageObj.engines)
      : null
  if (!engines?.node) {
    errors.push("package.json missing engines.node")
  }
  if (!stageObj.license) {
    errors.push("package.json missing license")
  }
  const repoField = stageObj.repository
  const hasRepoUrl =
    typeof repoField === "string"
    || (
      repoField
      && typeof repoField === "object"
      && !Array.isArray(repoField)
      && typeof /** @type {Record<string, unknown>} */ (repoField).url === "string"
    )
  if (!hasRepoUrl) {
    warnings.push("package.json repository URL not set (optional but recommended)")
  }
}

// --- CHANGELOG version heading (stage) ---
const changelogPath = path.join(stageRoot, "CHANGELOG.md")
if (releaseVersion && releaseVersion !== "0.0.0") {
  if (!fs.existsSync(changelogPath)) {
    errors.push("CHANGELOG.md missing while release version is non-placeholder")
  } else {
    const changelog = readTextForGate(changelogPath, "CHANGELOG.md", errors)
    if (changelog !== null) {
      const heading = checkChangelogHeading(changelog, releaseVersion)
      if (!heading.ok && heading.error) errors.push(heading.error)
    }
  }
}

// --- Release readiness gate (repo root; not staged into zip) ---
// Missing / unreadable / version-mismatched readiness is always an error.
// Incomplete Go flags are only exempted by --allow-incomplete-readiness.
if (!fs.existsSync(readinessPath)) {
  errors.push(
    "missing release-evidence/release-readiness.json — machine-readable readiness required"
  )
} else {
  const readiness = readJsonForGate(
    readinessPath,
    "release-evidence/release-readiness.json",
    errors
  )
  if (readiness !== null) {
    const readinessEval = evaluateReadinessForVerify(readiness, {
      expectedVersion: releaseVersion,
      allowIncompleteReadiness
    })
    errors.push(...readinessEval.errors)
    warnings.push(...readinessEval.warnings)
    if (
      readiness
      && typeof readiness === "object"
      && !Array.isArray(readiness)
      && /** @type {Record<string, unknown>} */ (readiness).go === true
      && /** @type {Record<string, unknown>} */ (readiness).orcaRuntimeVerified === true
      && Array.isArray(/** @type {Record<string, unknown>} */ (readiness).blockers)
      && /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (readiness).blockers).length
        === 0
      && !readinessEval.errors.some((e) => e.includes("No-Go") || e.includes("version"))
    ) {
      info("release readiness Go: go=true, orcaRuntimeVerified=true, blockers=[]")
    }
  }
}

if (warnings.length) {
  for (const w of warnings) console.warn(`[release:verify] WARN: ${w}`)
}

if (errors.length) {
  for (const e of errors) console.error(`[release:verify] ERROR: ${e}`)
  fail(`${errors.length} verification error(s)`)
}

if (fs.existsSync(indexJs)) {
  info(`sha256 dist/index.js ${sha256File(indexJs)}`)
}
if (fs.existsSync(styleCss)) {
  info(`sha256 dist/style.css ${sha256File(styleCss)}`)
}
info("release:verify OK")
