#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import {
  copyFile,
  ensureDir,
  fail,
  info,
  repoRoot,
  rmrf
} from "./lib/fs-utils.mjs"

const ALLOWED_LICENSES = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "(MIT OR GPL-3.0-or-later)",
  "(MIT AND Zlib)"
])

const root = repoRoot()
const releaseRoot = path.join(root, "release")
const licenseRoot = path.join(releaseRoot, "third-party-licenses")

let queried
try {
  queried = JSON.parse(
    execFileSync("npm", ["query", ":not(.dev)", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    })
  )
} catch (error) {
  fail(`unable to query production dependency licenses: ${error instanceof Error ? error.message : String(error)}`)
}

const packages = Array.from(
  new Map(
    queried
      .filter((entry) => entry?.name && entry?.version && entry?.location)
      .map((entry) => [`${entry.name}@${entry.version}`, entry])
  ).values()
).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))

const errors = []
for (const pkg of packages) {
  if (!pkg.license || !ALLOWED_LICENSES.has(pkg.license)) {
    errors.push(`${pkg.name}@${pkg.version}: unreviewed license ${JSON.stringify(pkg.license ?? null)}`)
  }
}
if (errors.length > 0) {
  for (const error of errors) console.error(`[release:licenses] ERROR: ${error}`)
  fail("production dependency license review failed")
}

rmrf(licenseRoot)
ensureDir(licenseRoot)

const report = []
for (const pkg of packages) {
  const packageDir = pkg.path || path.join(root, pkg.location)
  const source = findLicenseSource(packageDir)
  if (!source) {
    fail(`license text not found for ${pkg.name}@${pkg.version}`)
  }

  const fileName = `${safeName(pkg.name)}-${safeName(pkg.version)}.txt`
  copyFile(source, path.join(licenseRoot, fileName))
  report.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    repository: repositoryUrl(pkg.repository),
    licenseFile: `third-party-licenses/${fileName}`
  })
}

ensureDir(releaseRoot)
fs.writeFileSync(
  path.join(releaseRoot, "licenses.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
)

const noticeLines = [
  "# Third-Party Notices",
  "",
  "The release bundle includes or references the following production dependencies.",
  "The corresponding license texts are included in `third-party-licenses/`.",
  "",
  "| Package | Version | License | Repository | License text |",
  "| --- | --- | --- | --- | --- |",
  ...report.map((entry) =>
    `| ${entry.name} | ${entry.version} | ${entry.license} | ${entry.repository || "-"} | ${entry.licenseFile} |`
  ),
  ""
]
fs.writeFileSync(
  path.join(releaseRoot, "THIRD_PARTY_NOTICES.md"),
  noticeLines.join("\n"),
  "utf8"
)

info(`reviewed ${report.length} production dependency license entries`)

function findLicenseSource(packageDir) {
  const entries = fs.readdirSync(packageDir, { withFileTypes: true })
  const primary = entries
    .filter((entry) => entry.isFile() && /^(license|copying|notice)(\.|$)/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  if (primary) return path.join(packageDir, primary.name)

  const readme = entries.find(
    (entry) => entry.isFile() && /^readme(\.|$)/i.test(entry.name)
  )
  if (readme) {
    const full = path.join(packageDir, readme.name)
    if (/\blicen[cs]e\b/i.test(fs.readFileSync(full, "utf8"))) return full
  }
  return null
}

function repositoryUrl(repository) {
  if (typeof repository === "string") return repository
  return repository?.url || ""
}

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
}
