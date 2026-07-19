/**
 * Node test for deploy target validation (run with: node --test scripts/lib/deploy-target.test.mjs)
 */
import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { validateDeployTarget } from "./deploy-target.mjs"

const repo = "/Users/me/proj/orca-srs-plugin"
const home = "/Users/me"

test("requires absolute path and exact basename", () => {
  assert.equal(validateDeployTarget("", { repoRoot: repo, homeDir: home }).ok, false)
  assert.equal(validateDeployTarget("relative/orca-srs", { repoRoot: repo, homeDir: home }).ok, false)
  assert.equal(
    validateDeployTarget("/tmp/plugins/wrong-name", { repoRoot: repo, homeDir: home }).ok,
    false
  )
})

test("rejects dangerous roots", () => {
  assert.equal(validateDeployTarget("/", { repoRoot: repo, homeDir: home }).ok, false)
  assert.equal(validateDeployTarget(home, { repoRoot: repo, homeDir: home }).ok, false)
  assert.equal(validateDeployTarget(repo, { repoRoot: repo, homeDir: home }).ok, false)
  assert.equal(
    validateDeployTarget(path.dirname(repo), { repoRoot: repo, homeDir: home }).ok,
    false
  )
})

test("accepts plugins/orca-srs absolute path", () => {
  const t = validateDeployTarget("/tmp/orca/plugins/orca-srs", {
    repoRoot: repo,
    homeDir: home
  })
  assert.equal(t.ok, true)
  assert.equal(t.target, path.resolve("/tmp/orca/plugins/orca-srs"))
})
