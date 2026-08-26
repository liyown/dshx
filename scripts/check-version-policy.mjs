#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'

const packages = new Map([
  ['@becomeopc/dshx', 'packages/dshx/package.json'],
  ['create-dshx', 'packages/create-dshx/package.json'],
  ['@becomeopc/dshx-hub-cli', 'packages/framework-hub-cli/package.json'],
  ['@becomeopc/dshx-plugin-marketplace', 'packages/plugin-marketplace/package.json'],
])

const versions = new Map()
const errors = []

for (const [name, file] of packages) {
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  const version = typeof manifest.version === 'string' ? manifest.version : ''
  versions.set(name, version)
  const isUnreleasedMarketplace = name === '@becomeopc/dshx-plugin-marketplace' && version === '0.0.0'
  if (!isUnreleasedMarketplace && !/^0\.1\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push(`${name} must stay on the 0.1.x line; found ${JSON.stringify(version)} in ${file}.`)
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
    if (declaration[2] !== 'patch' && !isInitialMarketplace) {
      errors.push(`.changeset/${entry.name} declares ${declaration[2]} for ${declaration[1]}; use patch while the project remains on 0.1.x.`)
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`version policy: ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('version policy: public packages and changesets remain on 0.1.x\n')
}
