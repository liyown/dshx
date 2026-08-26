#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const site = (process.env.DSHX_HUB_URL || args.find(value => !value.startsWith('--')) || 'https://dshx.io').replace(/\/$/, '')
const requireMarketplacePlugin = args.includes('--require-marketplace-plugin')
const marketplaceManifest = JSON.parse(await readFile(new URL('../packages/plugin-marketplace/package.json', import.meta.url), 'utf8'))

async function check(path, validate, accept = 'application/json,text/plain,application/xml') {
  const response = await fetch(`${site}${path}`, { headers: { accept } })
  const type = response.headers.get('content-type') || ''
  const body = type.includes('json') ? await response.json() : await response.text()
  if (!validate(response, body)) throw new Error(`Hub smoke failed for ${path}: ${response.status} ${JSON.stringify(body)}`)
  process.stdout.write(`ok ${path}\n`)
}

for (const [path, validate] of [
  ['/api/health', (response, body) => response.ok && body.status === 'ok' && body.requiredTables === 'ready' && body.media === 'ready'],
  ['/api/plugins?locale=en&limit=1', (response, body) => response.ok && Array.isArray(body.items)],
  [
    '/api/marketplace/plugins?locale=en&limit=1',
    (response, body) => response.ok && Array.isArray(body.categories) && Array.isArray(body.items) && Object.hasOwn(body, 'nextCursor'),
  ],
  ['/api/github-stars', (response, body) => response.ok && (body.count === null || (Number.isInteger(body.count) && body.count >= 0))],
  ['/sitemap.xml', (response, body) => response.ok && String(body).includes('<urlset')],
  ['/robots.txt', (response, body) => response.ok && String(body).includes('/admin/')],
]) {
  await check(path, validate)
}

if (requireMarketplacePlugin) {
  const slug = 'dshx-plugin-marketplace'
  await check(`/api/marketplace/plugins/${slug}?locale=en`, (response, body) => {
    if (!response.ok || body?.plugin?.scope !== marketplaceManifest.name || body?.plugin?.version !== marketplaceManifest.version) return false
    return body.installTargets?.some(
      target =>
        (target.is_primary === 1 || target.is_primary === true) &&
        target.status === 'active' &&
        target.package_name === marketplaceManifest.name &&
        target.version === marketplaceManifest.version,
    )
  })
  await check('/en', (response, body) => response.ok && String(body).includes(marketplaceManifest.name), 'text/html')
} else {
  process.stdout.write('pending published marketplace presence: run "pnpm hub:smoke:published" after npm publication and Hub catalog promotion\n')
}
