#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const name = '@becomeopc/dshx-plugin-marketplace'
const manifestPath = 'packages/plugin-marketplace/package.json'
const expectedVersion = /^0\.2\.0-preview\.\d+$/
const dryRun = process.argv.includes('--dry-run')

function fail(message) {
  process.stderr.write(`preview marketplace: ${message}\n`)
  process.exitCode = 1
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function npmView(...args) {
  return run('npm', ['view', name, ...args])
}

function readDistTags() {
  return JSON.parse(npmView('dist-tags', '--json'))
}

async function main() {
  const branch = run('git', ['branch', '--show-current'])
  if (branch !== 'main') return fail(`publish only from main; current branch is ${JSON.stringify(branch)}.`)
  if (run('git', ['status', '--porcelain']) !== '') return fail('publish only from a clean working tree.')

  let preState
  try {
    preState = JSON.parse(await readFile('.changeset/pre.json', 'utf8'))
  } catch (error) {
    return fail(`Changesets prerelease state is missing or invalid: ${error instanceof Error ? error.message : String(error)}.`)
  }
  if (preState?.mode !== 'pre' || preState?.tag !== 'preview') {
    return fail('run "pnpm preview:enter" and version the packages before publishing.')
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== name) return fail(`${manifestPath} declares ${JSON.stringify(manifest.name)}.`)
  if (!expectedVersion.test(manifest.version)) {
    return fail(`${name} has unexpected Preview version ${JSON.stringify(manifest.version)}.`)
  }
  if (manifest.private === true) return fail(`${name} is private and cannot be published.`)
  if (manifest.publishConfig?.access !== 'public') return fail(`${name} must declare publishConfig.access as public.`)

  const version = manifest.version
  let published
  try {
    published = npmView(version, 'version', '--json') === JSON.stringify(version)
  } catch (error) {
    const stderr = String(error.stderr ?? '')
    if (!/\bE404\b|404 Not Found/.test(stderr)) {
      return fail(`could not query npm metadata: ${stderr.trim() || error.message}`)
    }
    published = false
  }

  if (published) {
    const tags = readDistTags()
    if (tags.preview !== version) {
      return fail(`${name}@${version} exists but the preview tag points at ${JSON.stringify(tags.preview)}.`)
    }
    if (tags.latest === version) {
      return fail(`${name}@${version} is already the latest tag; inspect npm before publishing anything else.`)
    }
    process.stdout.write(`${name}@${version} already has the preview tag; nothing to publish.\n`)
    return
  }

  if (dryRun) {
    process.stdout.write(`Would publish ${name}@${version} to npm with the preview tag.\n`)
    return
  }

  process.stdout.write(`Publishing ${name}@${version} to npm with the preview tag...\n`)
  try {
    execFileSync('pnpm', ['--filter', name, 'publish', '--tag', 'preview', '--access', 'public', '--no-git-checks'], { stdio: 'inherit' })
  } catch {
    return fail('pnpm publish failed; inspect npm before retrying.')
  }

  const tags = readDistTags()
  if (tags.preview !== version) {
    return fail(`publish finished but the preview tag points at ${JSON.stringify(tags.preview)}.`)
  }
  if (tags.latest === version) {
    return fail('publish finished but latest also points at this Preview version; inspect npm before continuing.')
  }
  process.stdout.write(`${name}@${version} is published with the preview tag; latest remains at ${JSON.stringify(tags.latest ?? null)}.\n`)
}

await main()
