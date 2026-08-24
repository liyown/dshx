#!/usr/bin/env node

const site = (process.env.DSHX_HUB_URL || process.argv[2] || 'https://dshx.io').replace(/\/$/, '')

for (const [path, validate] of [
  ['/api/health', (response, body) => response.ok && body.status === 'ok' && body.requiredTables === 'ready' && body.media === 'ready'],
  ['/api/plugins?locale=en&limit=1', (response, body) => response.ok && Array.isArray(body.items)],
  ['/sitemap.xml', (response, body) => response.ok && String(body).includes('<urlset')],
  ['/robots.txt', (response, body) => response.ok && String(body).includes('/admin/')],
]) {
  const response = await fetch(`${site}${path}`, { headers: { accept: 'application/json,text/plain,application/xml' } })
  const type = response.headers.get('content-type') || ''
  const body = type.includes('json') ? await response.json() : await response.text()
  if (!validate(response, body)) throw new Error(`Hub smoke failed for ${path}: ${response.status} ${JSON.stringify(body)}`)
  process.stdout.write(`ok ${path}\n`)
}
