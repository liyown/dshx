#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const expected = new Map([
  ['@becomeopc/dshx', /^0\.1\.4-preview\.\d+$/],
  ['create-dshx', /^0\.1\.4-preview\.\d+$/],
  ['@becomeopc/dshx-hub-cli', /^0\.1\.2-preview\.\d+$/],
  ['@becomeopc/dshx-plugin-marketplace', /^0\.1\.0-preview\.\d+$/],
])

const packageFiles = new Map([
  ['@becomeopc/dshx', 'packages/dshx/package.json'],
  ['create-dshx', 'packages/create-dshx/package.json'],
  ['@becomeopc/dshx-hub-cli', 'packages/framework-hub-cli/package.json'],
  ['@becomeopc/dshx-plugin-marketplace', 'packages/plugin-marketplace/package.json'],
])

function fail(message) {
  process.stderr.write(`preview release: ${message}\n`)
  process.exitCode = 1
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const branch = git('branch', '--show-current')
if (branch !== 'main') fail(`publish only from main; current branch is ${JSON.stringify(branch)}.`)

const status = git('status', '--porcelain')
if (status !== '') fail('publish only from a clean working tree.')

let preState
try {
  preState = JSON.parse(await readFile('.changeset/pre.json', 'utf8'))
} catch (error) {
  fail(`Changesets prerelease state is missing or invalid: ${error instanceof Error ? error.message : String(error)}.`)
}
if (preState?.mode !== 'pre' || preState?.tag !== 'preview') {
  fail('run "pnpm preview:enter" and version the packages before publishing.')
}

const versions = new Map()
for (const [name, file] of packageFiles) {
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  versions.set(name, manifest.version)
  if (!expected.get(name)?.test(manifest.version)) fail(`${name} has unexpected Preview version ${JSON.stringify(manifest.version)}.`)
  if (manifest.private === true) fail(`${name} is private and cannot be published.`)
  if (manifest.publishConfig?.access !== 'public') fail(`${name} must declare publishConfig.access as public.`)
}
if (versions.get('@becomeopc/dshx') !== versions.get('create-dshx')) fail('Core and create-dshx Preview versions must match.')

if (process.exitCode === undefined) {
  const directory = await mkdtemp(join(tmpdir(), 'dshx-preview-plan-'))
  const output = join(directory, 'publish-plan.json')
  try {
    execFileSync('pnpm', ['exec', 'changeset', 'publish-plan', '--output', output], { stdio: 'inherit' })
    const document = JSON.parse(await readFile(output, 'utf8'))
    const releases = document.plan.flat().filter(release => release.kind === 'publish')
    if (releases.length === 0) fail('publish plan contains no unpublished Preview packages.')
    for (const release of releases) {
      if (!expected.has(release.name)) fail(`publish plan unexpectedly contains ${release.name}.`)
      if (release.tag !== 'preview') fail(`${release.name} would publish to ${JSON.stringify(release.tag)} instead of preview.`)
      if (release.version !== versions.get(release.name)) fail(`${release.name} publish-plan version does not match package.json.`)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
}

if (process.exitCode === undefined) process.stdout.write('preview release: versions, prerelease state, git state, and npm publish plan are safe\n')
