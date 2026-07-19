/**
 * Node tests for release gate helpers.
 * Run: node --test scripts/lib/release-gates.test.mjs
 */
import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import {
  checkChangelogHeading,
  collectIdenticalReleaseVersions,
  collectStructuredEvidencePaths,
  containsLocalHomePath,
  evaluateReadinessForReady,
  evaluateReadinessForVerify,
  parseStrictSemver,
  scanStagedTextContent,
  validateRepoRelativeEvidencePath,
  validateStructuredEvidencePaths
} from "./release-gates.mjs"

test("parseStrictSemver accepts x.y.z only", () => {
  const errors = []
  assert.equal(parseStrictSemver("v", "1.0.0", errors), "1.0.0")
  assert.equal(errors.length, 0)
  assert.equal(parseStrictSemver("v", "1.0.0-rc.1", errors), null)
  assert.equal(parseStrictSemver("v", "v1.0.0", errors), null)
  assert.equal(parseStrictSemver("v", 1, errors), null)
  assert.ok(errors.length >= 3)
})

test("collectIdenticalReleaseVersions requires four matching strict versions", () => {
  const okErrors = []
  assert.equal(
    collectIdenticalReleaseVersions(
      {
        rootVersion: "1.2.3",
        lockVersion: "1.2.3",
        lockPackagesVersion: "1.2.3",
        stageVersion: "1.2.3"
      },
      okErrors
    ),
    "1.2.3"
  )
  assert.equal(okErrors.length, 0)

  const mismatch = []
  assert.equal(
    collectIdenticalReleaseVersions(
      {
        rootVersion: "1.0.0",
        lockVersion: "1.0.0",
        lockPackagesVersion: "1.0.1",
        stageVersion: "1.0.0"
      },
      mismatch
    ),
    null
  )
  assert.ok(mismatch.some((e) => e.includes("must be identical")))

  const prerelease = []
  assert.equal(
    collectIdenticalReleaseVersions(
      {
        rootVersion: "1.0.0",
        lockVersion: "1.0.0-rc.1",
        lockPackagesVersion: "1.0.0",
        stageVersion: "1.0.0"
      },
      prerelease
    ),
    null
  )
  assert.ok(prerelease.some((e) => e.includes("strict semver")))

  const missing = []
  assert.equal(
    collectIdenticalReleaseVersions(
      {
        rootVersion: "1.0.0",
        lockVersion: "1.0.0",
        lockPackagesVersion: undefined,
        stageVersion: "1.0.0"
      },
      missing
    ),
    null
  )
  assert.ok(missing.some((e) => e.includes('packages[""].version')))
})

test("checkChangelogHeading requires exactly one dated heading", () => {
  const body = "# Changelog\n\n## [1.0.0] - 2026-07-19\n\n- note\n"
  assert.equal(checkChangelogHeading(body, "1.0.0").ok, true)
  assert.equal(checkChangelogHeading("# Changelog\n", "1.0.0").ok, false)
  assert.equal(checkChangelogHeading(body + "\n## [1.0.0] - 2026-07-20\n", "1.0.0").count, 2)
  assert.equal(checkChangelogHeading("## [1.0.0] - bad-date\n", "1.0.0").ok, false)
  assert.equal(checkChangelogHeading("## [1.0.0] - 2026-07-19 extra\n", "1.0.0").ok, false)
  assert.equal(checkChangelogHeading(body, "0.0.0").ok, false)
})

test("scanStagedTextContent flags secrets and home paths", () => {
  const home = scanStagedTextContent("path=/Users/alice/secret", "f.js")
  assert.ok(home.errors.some((e) => e.includes("home path")))
  const map = scanStagedTextContent("//# sourceMappingURL=x.map", "f.js")
  assert.ok(map.errors.some((e) => e.includes("sourceMappingURL")))
  const dev = scanStagedTextContent("react-jsx-runtime.development.js", "f.js")
  assert.ok(dev.errors.some((e) => e.includes("development")))
  const sk = scanStagedTextContent("key=sk-abcdefghijklmnopqrstuvwxyz12", "f.js")
  assert.ok(sk.errors.some((e) => e.includes("secret")))
  const clean = scanStagedTextContent("Bearer ${apiKey}", "f.js")
  assert.equal(clean.errors.length, 0)
})

test("containsLocalHomePath covers unix and windows", () => {
  assert.equal(containsLocalHomePath("/Users/me/x"), true)
  assert.equal(containsLocalHomePath("/home/me/x"), true)
  assert.equal(containsLocalHomePath("C:\\Users\\me\\x"), true)
  assert.equal(containsLocalHomePath("repo-relative/path"), false)
})

test("evaluateReadinessForVerify: allow-incomplete only softens go/runtime/blockers", () => {
  const noGo = {
    version: "1.0.0",
    go: false,
    orcaRuntimeVerified: false,
    blockers: ["x"]
  }
  const soft = evaluateReadinessForVerify(noGo, {
    expectedVersion: "1.0.0",
    allowIncompleteReadiness: true
  })
  assert.equal(soft.errors.length, 0)
  assert.ok(soft.warnings.some((w) => w.includes("No-Go")))

  const hard = evaluateReadinessForVerify(noGo, {
    expectedVersion: "1.0.0",
    allowIncompleteReadiness: false
  })
  assert.ok(hard.errors.some((e) => e.includes("No-Go")))

  const badVersion = evaluateReadinessForVerify(
    { ...noGo, version: "9.9.9" },
    { expectedVersion: "1.0.0", allowIncompleteReadiness: true }
  )
  assert.ok(badVersion.errors.some((e) => e.includes("version")))
  // flag must not clear version mismatch
  assert.ok(badVersion.errors.some((e) => e.includes("9.9.9")))

  const corrupt = evaluateReadinessForVerify(null, {
    expectedVersion: "1.0.0",
    allowIncompleteReadiness: true
  })
  assert.ok(corrupt.errors.some((e) => e.includes("non-null object")))

  const badBlockers = evaluateReadinessForVerify(
    { version: "1.0.0", go: false, orcaRuntimeVerified: false, blockers: "nope" },
    { expectedVersion: "1.0.0", allowIncompleteReadiness: true }
  )
  assert.ok(badBlockers.errors.some((e) => e.includes("blockers must be an array")))
})

test("evaluateReadinessForReady requires go fields, sha, approver, time", () => {
  const sha = "a".repeat(64)
  const good = {
    version: "1.0.0",
    go: true,
    orcaRuntimeVerified: true,
    blockers: [],
    verifiedDistSha256: sha,
    approvedBy: "maintainer",
    verifiedAt: "2026-07-19T12:00:00.000Z"
  }
  assert.deepEqual(
    evaluateReadinessForReady(good, { packageVersion: "1.0.0", stagedDistSha256: sha }),
    []
  )

  const missingStage = evaluateReadinessForReady(good, {
    packageVersion: "1.0.0",
    stagedDistSha256: null
  })
  assert.ok(missingStage.some((e) => e.includes("staged dist/index.js missing")))

  const mismatch = evaluateReadinessForReady(good, {
    packageVersion: "1.0.0",
    stagedDistSha256: "b".repeat(64)
  })
  assert.ok(mismatch.some((e) => e.includes("does not match")))

  const noGo = evaluateReadinessForReady(
    { ...good, go: false, blockers: ["still blocked"] },
    { packageVersion: "1.0.0", stagedDistSha256: sha }
  )
  assert.ok(noGo.some((e) => e.includes("go must be true")))
  assert.ok(noGo.some((e) => e.includes("blockers must be an empty array")))
})

test("validateRepoRelativeEvidencePath rejects abs, .., missing", () => {
  const repo = "/repo/root"
  const exists = (p) => p === path.resolve(repo, "release-evidence/console-readonly-scripts.md")

  assert.equal(
    validateRepoRelativeEvidencePath("release-evidence/console-readonly-scripts.md", repo, {
      existsSync: exists
    }).ok,
    true
  )
  assert.equal(
    validateRepoRelativeEvidencePath("/Users/me/file.json", repo, { existsSync: exists }).ok,
    false
  )
  assert.equal(
    validateRepoRelativeEvidencePath("../outside", repo, { existsSync: () => true }).ok,
    false
  )
  assert.equal(
    validateRepoRelativeEvidencePath("release-evidence/missing.json", repo, {
      existsSync: () => false
    }).ok,
    false
  )
})

test("collectStructuredEvidencePaths + validateStructuredEvidencePaths", () => {
  const readiness = {
    attachment: {
      path: "release-evidence/a.json",
      paths: ["release-evidence/b.json"]
    },
    attachments: [{ file: "release-evidence/c.json" }, "release-evidence/d.json"],
    evidencePaths: ["release-evidence/e.json"]
  }
  const collected = collectStructuredEvidencePaths(readiness)
  assert.equal(collected.length, 5)

  const repo = "/repo"
  const okPaths = new Set(
    ["a", "b", "c", "d", "e"].map((x) => path.resolve(repo, `release-evidence/${x}.json`))
  )
  const errors = validateStructuredEvidencePaths(readiness, repo, {
    existsSync: (p) => okPaths.has(p)
  })
  assert.equal(errors.length, 0)

  const withAbs = validateStructuredEvidencePaths(
    { attachment: { path: "/Users/me/x.json" } },
    repo,
    { existsSync: () => true }
  )
  assert.ok(withAbs.some((e) => e.includes("repo-relative")))
})
