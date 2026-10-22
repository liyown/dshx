#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'

const packages = new Map([
  ['@becomeopc/dshx', 'packages/dshx/package.json'],
  ['create-dshx', 'packages/create-dshx/package.json'],
  ['@becomeopc/dshx-hub-cli', 'packages/framework-hub-cli/package.json'],
  ['@becomeopc/dshx-hub-contracts', 'packages/hub-contracts/package.json'],
  ['@becomeopc/dshx-plugin-marketplace', 'packages/plugin-marketplace/package.json'],
])

// The Hub wire contract and the CLI that speaks it version independently of the
// DSH compatibility line, because they are released against a deployed Hub
// rather than against a DSH runtime.
const hubPackages = new Set(['@becomeopc/dshx-hub-cli', '@becomeopc/dshx-hub-contracts'])

const versions = new Map()
const errors = []

for (const [name, file] of packages) {
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  const version = typeof manifest.version === 'string' ? manifest.version : ''
  versions.set(name, version)
  const isUnreleasedMarketplace = name === '@becomeopc/dshx-plugin-marketplace' && version === '0.0.0'
  const pattern = hubPackages.has(name) ? /^0\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/ : /^0\.2\.\d+(?:-[0-9A-Za-z.-]+)?$/
  if (!isUnreleasedMarketplace && !pattern.test(version)) {
    errors.push(
      hubPackages.has(name)
        ? `${name} must declare a valid semver version; found ${JSON.stringify(version)} in ${file}.`
        : `${name} must stay on the 0.2.x DSH line; found ${JSON.stringify(version)} in ${file}.`,
    )
  }
}

if (versions.get('@becomeopc/dshx') !== versions.get('create-dshx')) {
  errors.push('@becomeopc/dshx and create-dshx must have the same version.')
}

for (const entry of await readdir('.changeset', { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue
  const content = await readFile(`.changeset/${entry.name}`, 'utf8')
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) continue

  for (const line of frontmatter[1].split(/\r?\n/)) {
    const declaration = line.match(/^['"]?([^'":]+)['"]?:\s*(patch|minor|major)\s*$/)
    if (!declaration || !packages.has(declaration[1])) continue
    const isInitialMarketplace =
      declaration[1] === '@becomeopc/dshx-plugin-marketplace' && versions.get(declaration[1]) === '0.0.0' && declaration[2] === 'minor'
    if (declaration[2] === 'major' && !isInitialMarketplace) {
      errors.push(`.changeset/${entry.name} declares major for ${declaration[1]}; a 0.x minor is the breaking-change bump.`)
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`version policy: ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('version policy: DSH-facing packages remain on 0.2.x and changesets avoid major bumps\n')
}
