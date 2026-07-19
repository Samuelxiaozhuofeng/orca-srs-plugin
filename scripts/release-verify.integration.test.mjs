/**
 * Integration tests for release-verify CLI against temp fixtures.
 * Run: node --test scripts/release-verify.integration.test.mjs
 */
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")

/**
 * @param {{
 *   rootVersion?: string,
 *   lockTop?: string,
 *   lockPkg?: string,
 *   stageVersion?: string,
 *   changelog?: string,
 *   readiness?: object | null,
 *   stageTextExtra?: string,
 *   omitLicenseTexts?: boolean
 * }} opts
 */
function makeFixture(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-srs-release-verify-"))
  const rootVersion = opts.rootVersion ?? "1.0.0"
  const lockTop = opts.lockTop ?? rootVersion
  const lockPkg = opts.lockPkg ?? rootVersion
  const stageVersion = opts.stageVersion ?? rootVersion

  const write = (rel, content) => {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }

  write(
    "package.json",
    JSON.stringify(
      {
        name: "orca-srs",
        version: rootVersion,
        license: "MIT",
        engines: { node: ">=20.19.0" },
        repository: { type: "git", url: "https://example.com/orca-srs.git" }
      },
      null,
      2
    )
  )
  write(
    "package-lock.json",
    JSON.stringify(
      {
        name: "orca-srs",
        version: lockTop,
        lockfileVersion: 3,
        packages: {
          "": { name: "orca-srs", version: lockPkg }
        }
      },
      null,
      2
    )
  )

  const stage = "release/orca-srs"
  write(`${stage}/icon.png`, "png")
  write(`${stage}/dist/index.js`, `export const v = ${JSON.stringify(stageVersion)};\n`)
  write(`${stage}/dist/style.css`, "/* css */\n")
  write(`${stage}/README.md`, "# orca-srs\n")
  write(`${stage}/LICENSE`, "MIT\n")
  write(
    `${stage}/CHANGELOG.md`,
    opts.changelog
      ?? `# Changelog\n\n## [Unreleased]\n\n## [${stageVersion}] - 2026-07-19\n\n- release\n`
  )
  write(`${stage}/THIRD_PARTY_NOTICES.md`, "# notices\n")
  if (!opts.omitLicenseTexts) {
    write(`${stage}/third-party-licenses/example.txt`, "MIT\n")
  }
  write(
    `${stage}/package.json`,
    JSON.stringify(
      {
        name: "orca-srs",
        version: stageVersion,
        license: "MIT",
        engines: { node: ">=20.19.0" },
        repository: { type: "git", url: "https://example.com/orca-srs.git" }
      },
      null,
      2
    )
  )
  if (opts.stageTextExtra) {
    write(`${stage}/extra.txt`, opts.stageTextExtra)
  }

  if (opts.readiness !== null) {
    write(
      "release-evidence/release-readiness.json",
      JSON.stringify(
        opts.readiness
          ?? {
            version: rootVersion,
            go: false,
            orcaRuntimeVerified: false,
            blockers: ["fixture no-go"]
          },
        null,
        2
      )
    )
  }

  return { dir, rootVersion, stageVersion }
}

/**
 * Run release-verify against a fixture by writing a temporary verify entry that
 * re-exports logic with fixture repo root injected via env ORCA_SRS_REPO_ROOT.
 * Since production scripts don't support that env, we copy scripts into fixture
 * and patch fs-utils.repoRoot in the copy.
 */
function runVerify(fixtureDir, args = []) {
  const scriptsDir = path.join(fixtureDir, "scripts")
  fs.cpSync(path.join(repoRoot, "scripts"), scriptsDir, { recursive: true })
  const fsUtilsPath = path.join(scriptsDir, "lib", "fs-utils.mjs")
  let text = fs.readFileSync(fsUtilsPath, "utf8")
  text = text.replace(
    "export function repoRoot() {\n  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), \"../..\")\n}",
    `export function repoRoot() {\n  return ${JSON.stringify(fixtureDir)}\n}`
  )
  fs.writeFileSync(fsUtilsPath, text)

  const result = spawnSync(
    process.execPath,
    [path.join(scriptsDir, "release-verify.mjs"), ...args],
    { cwd: fixtureDir, encoding: "utf8" }
  )
  return result
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

test("matching versions + incomplete readiness allowed → exit 0", () => {
  const { dir } = makeFixture()
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stderr + r.stdout, /release:verify OK|WARN:.*No-Go/s)
  } finally {
    cleanup(dir)
  }
})

test("version mismatch is error even with --allow-incomplete-readiness", () => {
  const { dir } = makeFixture({ lockPkg: "1.0.1" })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /must be identical|packages\[""\]\.version/)
  } finally {
    cleanup(dir)
  }
})

test("missing readiness is error even with --allow-incomplete-readiness", () => {
  const { dir } = makeFixture({ readiness: null })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /missing release-evidence\/release-readiness\.json/)
  } finally {
    cleanup(dir)
  }
})

test("corrupt readiness is error even with --allow-incomplete-readiness", () => {
  const { dir } = makeFixture()
  try {
    fs.writeFileSync(
      path.join(dir, "release-evidence", "release-readiness.json"),
      "{ not json"
    )
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /failed to parse|parse failed/i)
  } finally {
    cleanup(dir)
  }
})

test("readiness version mismatch not exempted", () => {
  const { dir } = makeFixture({
    readiness: {
      version: "9.9.9",
      go: false,
      orcaRuntimeVerified: false,
      blockers: ["x"]
    }
  })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /release-readiness\.json version/)
  } finally {
    cleanup(dir)
  }
})

test("default verify fails on No-Go without flag", () => {
  const { dir } = makeFixture()
  try {
    const r = runVerify(dir, [])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /No-Go/)
  } finally {
    cleanup(dir)
  }
})

test("CHANGELOG missing exact heading fails", () => {
  const { dir } = makeFixture({
    changelog: "# Changelog\n\n## [Unreleased]\n"
  })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /CHANGELOG\.md must contain exactly one/)
  } finally {
    cleanup(dir)
  }
})

test("home path in staged text fails and is not readiness-exempt", () => {
  const { dir } = makeFixture({
    stageTextExtra: "leak=/Users/someone/private\n"
  })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /home path/)
  } finally {
    cleanup(dir)
  }
})

test("missing third-party license texts fails", () => {
  const { dir } = makeFixture({ omitLicenseTexts: true })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /third-party license/)
  } finally {
    cleanup(dir)
  }
})

test("prerelease version rejected", () => {
  const { dir } = makeFixture({
    rootVersion: "1.0.0-rc.1",
    lockTop: "1.0.0-rc.1",
    lockPkg: "1.0.0-rc.1",
    stageVersion: "1.0.0-rc.1",
    changelog: "## [1.0.0-rc.1] - 2026-07-19\n"
  })
  try {
    const r = runVerify(dir, ["--allow-incomplete-readiness"])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /strict semver/)
  } finally {
    cleanup(dir)
  }
})
