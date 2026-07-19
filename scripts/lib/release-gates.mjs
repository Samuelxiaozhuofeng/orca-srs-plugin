/**
 * Pure / mostly-pure release gate helpers shared by release-verify / release-ready.
 * Keep side effects out of these functions so Node tests can cover them without a full stage tree.
 */

import fs from "node:fs"
import path from "node:path"

/** Stable release versions only: x.y.z (no prerelease / build metadata). */
export const STRICT_SEMVER = /^\d+\.\d+\.\d+$/

export const ISO_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * @param {string} label
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {string | null}
 */
export function parseStrictSemver(label, value, errors) {
  if (typeof value !== "string") {
    errors.push(`${label} is missing or not a string`)
    return null
  }
  if (!STRICT_SEMVER.test(value)) {
    errors.push(`${label} ${JSON.stringify(value)} is not strict semver x.y.z`)
    return null
  }
  return value
}

/**
 * Require root, lock top-level, lock packages[""], and stage versions to all be
 * strict semver and fully identical.
 *
 * @param {{
 *   rootVersion: unknown,
 *   lockVersion: unknown,
 *   lockPackagesVersion: unknown,
 *   stageVersion: unknown
 * }} versions
 * @param {string[]} errors
 * @returns {string | null} canonical version when all four match
 */
export function collectIdenticalReleaseVersions(versions, errors) {
  const fields = [
    ["root package.json.version", versions.rootVersion],
    ["package-lock.json top-level version", versions.lockVersion],
    ['package-lock.json packages[""].version', versions.lockPackagesVersion],
    ["stage package.json.version", versions.stageVersion]
  ]
  /** @type {Array<string | null>} */
  const parsed = fields.map(([label, value]) => parseStrictSemver(label, value, errors))
  if (parsed.some((v) => v === null)) return null
  const unique = new Set(/** @type {string[]} */ (parsed))
  if (unique.size !== 1) {
    errors.push(
      "release versions must be identical: "
        + fields
          .map(([label], i) => `${label}=${JSON.stringify(parsed[i])}`)
          .join(", ")
    )
    return null
  }
  return /** @type {string} */ (parsed[0])
}

/**
 * Exactly one CHANGELOG heading: `## [x.y.z] - YYYY-MM-DD` (full line).
 * @param {string} changelogText
 * @param {string} version
 * @returns {{ ok: boolean, count: number, error?: string }}
 */
export function checkChangelogHeading(changelogText, version) {
  if (typeof changelogText !== "string") {
    return { ok: false, count: 0, error: "CHANGELOG text is missing or not a string" }
  }
  if (!STRICT_SEMVER.test(version) || version === "0.0.0") {
    return {
      ok: false,
      count: 0,
      error: `CHANGELOG heading check requires non-placeholder strict semver (got ${JSON.stringify(version)})`
    }
  }
  const headingRe = new RegExp(
    `^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`,
    "gm"
  )
  const matches = changelogText.match(headingRe) ?? []
  if (matches.length !== 1) {
    return {
      ok: false,
      count: matches.length,
      error:
        `CHANGELOG.md must contain exactly one "## [${version}] - YYYY-MM-DD" heading `
        + `(found ${matches.length})`
    }
  }
  return { ok: true, count: 1 }
}

/**
 * Detect real secret literals / leak patterns in staged text (not template fragments).
 * @param {string} text
 * @param {string} rel
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function scanStagedTextContent(text, rel) {
  const errors = []
  const warnings = []
  if (/sourceMappingURL/i.test(text)) {
    errors.push(`${rel} contains sourceMappingURL`)
  }
  if (containsLocalHomePath(text)) {
    errors.push(`${rel} contains absolute local home path`)
  }
  if (/react-jsx-runtime\.development/i.test(text)) {
    errors.push(`${rel} embeds react-jsx-runtime.development`)
  }
  if (/\bsk-[A-Za-z0-9]{20,}\b/.test(text)) {
    errors.push(`${rel} may contain OpenAI-style secret key literal`)
  }
  if (/\bfc-[A-Za-z0-9]{20,}\b/.test(text)) {
    errors.push(`${rel} may contain Firecrawl-style secret key literal`)
  }
  if (/Bearer\s+(?!\$\{)(?!\*\*\*)[A-Za-z0-9._-]{16,}/.test(text)) {
    errors.push(`${rel} may contain Bearer token literal`)
  }
  if (/BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/.test(text)) {
    errors.push(`${rel} contains private key material`)
  }
  if (/(?:api[_-]?key|secret)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i.test(text)) {
    if (!/length|placeholder|example|your[-_]?key/i.test(text)) {
      warnings.push(`${rel} may embed hardcoded api key assignment`)
    }
  }
  return { errors, warnings }
}

/** @param {string} text */
export function containsLocalHomePath(text) {
  return (
    /\/Users\/[A-Za-z0-9._-]+/.test(text)
    || /\/home\/[A-Za-z0-9._-]+/.test(text)
    || /[A-Za-z]:\\Users\\/i.test(text)
  )
}

/**
 * Readiness structural + Go evaluation.
 * --allow-incomplete-readiness only softens go/runtime/blockers incompleteness.
 * Missing / corrupt / version mismatch always hard-fail.
 *
 * @param {unknown} readiness
 * @param {{ expectedVersion: string | null, allowIncompleteReadiness: boolean }} opts
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function evaluateReadinessForVerify(readiness, opts) {
  const errors = []
  const warnings = []
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    errors.push("release-readiness.json must be a non-null object")
    return { errors, warnings }
  }
  const r = /** @type {Record<string, unknown>} */ (readiness)
  const readinessVersion = typeof r.version === "string" ? r.version : null
  if (!readinessVersion) {
    errors.push("release-readiness.json missing string version")
  } else if (opts.expectedVersion && readinessVersion !== opts.expectedVersion) {
    errors.push(
      `release-readiness.json version ${JSON.stringify(readinessVersion)} `
        + `!== expected ${JSON.stringify(opts.expectedVersion)}`
    )
  }

  const goOk = r.go === true
  const runtimeOk = r.orcaRuntimeVerified === true
  const blockers = Array.isArray(r.blockers) ? r.blockers : null
  if (blockers === null) {
    errors.push("release-readiness.json blockers must be an array")
  }
  const blockersEmpty = blockers !== null && blockers.length === 0
  const readinessGo = goOk && runtimeOk && blockersEmpty

  if (!readinessGo) {
    const reasons = []
    if (!goOk) reasons.push(`go=${JSON.stringify(r.go)}`)
    if (!runtimeOk) {
      reasons.push(`orcaRuntimeVerified=${JSON.stringify(r.orcaRuntimeVerified)}`)
    }
    if (blockers !== null && !blockersEmpty) {
      reasons.push(`blockers.length=${blockers.length}`)
    }
    const msg = `release readiness No-Go (${reasons.join(", ") || "incomplete"})`
    if (opts.allowIncompleteReadiness) {
      warnings.push(`${msg} (allowed by --allow-incomplete-readiness)`)
    } else {
      errors.push(msg)
    }
  }
  return { errors, warnings }
}

/**
 * Production-ready readiness checks (after structural verify has passed).
 * @param {unknown} readiness
 * @param {{ packageVersion: string, stagedDistSha256: string | null }} opts
 * @returns {string[]}
 */
export function evaluateReadinessForReady(readiness, opts) {
  const errors = []
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    errors.push("release-readiness.json must be a non-null object")
    return errors
  }
  const r = /** @type {Record<string, unknown>} */ (readiness)

  if (r.version !== opts.packageVersion) {
    errors.push(
      `readiness version ${JSON.stringify(r.version)} !== ${JSON.stringify(opts.packageVersion)}`
    )
  }
  if (r.go !== true) errors.push("readiness go must be true")
  if (r.orcaRuntimeVerified !== true) {
    errors.push("readiness orcaRuntimeVerified must be true")
  }
  if (!Array.isArray(r.blockers) || r.blockers.length !== 0) {
    errors.push("readiness blockers must be an empty array")
  }

  const verifiedSha = r.verifiedDistSha256
  if (typeof verifiedSha !== "string" || !/^[a-f0-9]{64}$/.test(verifiedSha)) {
    errors.push("readiness verifiedDistSha256 must be a lowercase SHA-256")
  } else if (opts.stagedDistSha256 === null) {
    errors.push("staged dist/index.js missing; cannot verify verifiedDistSha256")
  } else if (verifiedSha !== opts.stagedDistSha256) {
    errors.push("readiness verifiedDistSha256 does not match staged dist/index.js")
  }

  if (typeof r.approvedBy !== "string" || !r.approvedBy.trim()) {
    errors.push("readiness approvedBy must be a non-empty string")
  }
  if (
    typeof r.verifiedAt !== "string"
    || !ISO_UTC_RE.test(r.verifiedAt)
    || Number.isNaN(Date.parse(r.verifiedAt))
  ) {
    errors.push("readiness verifiedAt must be an ISO-8601 UTC timestamp")
  }
  return errors
}

/**
 * Validate a path value is repo-relative, has no `..`, and exists under repoRoot.
 * @param {string} relPath
 * @param {string} repoRoot
 * @param {{ existsSync?: (p: string) => boolean }} [io]
 * @returns {{ ok: true, absolute: string } | { ok: false, error: string }}
 */
export function validateRepoRelativeEvidencePath(relPath, repoRoot, io = {}) {
  const existsSync = io.existsSync ?? fs.existsSync
  if (typeof relPath !== "string" || !relPath.trim()) {
    return { ok: false, error: "evidence path must be a non-empty string" }
  }
  const trimmed = relPath.trim()
  if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: `evidence path must be repo-relative (got absolute): ${trimmed}` }
  }
  if (trimmed.startsWith("~")) {
    return { ok: false, error: `evidence path must not use home shorthand: ${trimmed}` }
  }
  const normalized = path.posix.normalize(trimmed.replace(/\\/g, "/"))
  if (normalized.startsWith("..") || normalized.split("/").includes("..")) {
    return { ok: false, error: `evidence path must not contain '..': ${trimmed}` }
  }
  if (normalized.startsWith("/")) {
    return { ok: false, error: `evidence path must be repo-relative: ${trimmed}` }
  }
  const absolute = path.resolve(repoRoot, normalized)
  const rootResolved = path.resolve(repoRoot)
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    return { ok: false, error: `evidence path escapes repo root: ${trimmed}` }
  }
  if (!existsSync(absolute)) {
    return { ok: false, error: `evidence path does not exist: ${normalized}` }
  }
  return { ok: true, absolute }
}

/**
 * Collect structured attachment path fields from readiness JSON.
 * Recognizes: attachment.path / file / relativePath, attachment.paths[],
 * attachments[].path|file|relativePath, evidencePaths[], evidenceFiles[].
 * @param {unknown} readiness
 * @returns {Array<{ field: string, path: string }>}
 */
export function collectStructuredEvidencePaths(readiness) {
  /** @type {Array<{ field: string, path: string }>} */
  const out = []
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    return out
  }
  const r = /** @type {Record<string, unknown>} */ (readiness)

  const pushPath = (field, value) => {
    if (typeof value === "string" && value.trim()) {
      out.push({ field, path: value.trim() })
    }
  }

  if (r.attachment && typeof r.attachment === "object" && !Array.isArray(r.attachment)) {
    const a = /** @type {Record<string, unknown>} */ (r.attachment)
    pushPath("attachment.path", a.path)
    pushPath("attachment.file", a.file)
    pushPath("attachment.relativePath", a.relativePath)
    if (Array.isArray(a.paths)) {
      a.paths.forEach((p, i) => pushPath(`attachment.paths[${i}]`, p))
    }
    if (Array.isArray(a.files)) {
      a.files.forEach((p, i) => pushPath(`attachment.files[${i}]`, p))
    }
  }

  if (Array.isArray(r.attachments)) {
    r.attachments.forEach((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = /** @type {Record<string, unknown>} */ (item)
        pushPath(`attachments[${i}].path`, o.path)
        pushPath(`attachments[${i}].file`, o.file)
        pushPath(`attachments[${i}].relativePath`, o.relativePath)
      } else if (typeof item === "string") {
        pushPath(`attachments[${i}]`, item)
      }
    })
  }

  if (Array.isArray(r.evidencePaths)) {
    r.evidencePaths.forEach((p, i) => pushPath(`evidencePaths[${i}]`, p))
  }
  if (Array.isArray(r.evidenceFiles)) {
    r.evidenceFiles.forEach((p, i) => pushPath(`evidenceFiles[${i}]`, p))
  }

  return out
}

/**
 * @param {unknown} readiness
 * @param {string} repoRoot
 * @param {{ existsSync?: (p: string) => boolean }} [io]
 * @returns {string[]}
 */
export function validateStructuredEvidencePaths(readiness, repoRoot, io = {}) {
  const errors = []
  for (const { field, path: rel } of collectStructuredEvidencePaths(readiness)) {
    const result = validateRepoRelativeEvidencePath(rel, repoRoot, io)
    if (!result.ok) {
      errors.push(`${field}: ${result.error}`)
    }
  }
  return errors
}

/**
 * Safe text read for gate scripts: failures become errors[], never silent.
 * @param {string} filePath
 * @param {string} label
 * @param {string[]} errors
 * @returns {string | null}
 */
export function readTextForGate(filePath, label, errors) {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch (error) {
    errors.push(
      `failed to read ${label}: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/**
 * Safe JSON read for gate scripts.
 * @param {string} filePath
 * @param {string} label
 * @param {string[]} errors
 * @returns {unknown | null}
 */
export function readJsonForGate(filePath, label, errors) {
  const text = readTextForGate(filePath, label, errors)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    errors.push(
      `failed to parse ${label}: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}
