import process from 'node:process'

const key = '70e9ad636dccee550f503f28a9bef3df'
const siteUrl = 'https://dshx.io'
const endpoint = 'https://api.indexnow.org/indexnow'

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const sitemapUrl = readOption('--sitemap') ?? `${siteUrl}/sitemap.xml`
const dryRun = process.argv.includes('--dry-run')
const sitemapResponse = await fetch(sitemapUrl)

if (!sitemapResponse.ok) {
  throw new Error(`Could not load sitemap (${sitemapResponse.status}): ${sitemapUrl}`)
}

const xml = await sitemapResponse.text()
const extractedUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match =>
  match[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>'),
)
const urls = [...new Set(extractedUrls)]

if (urls.length === 0) {
  throw new Error(`Sitemap contains no URLs: ${sitemapUrl}`)
}

if (urls.length > 50_000) {
  throw new Error(`Sitemap contains ${urls.length} URLs; refusing a submission above 50,000.`)
}

for (const url of urls) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.host !== new URL(siteUrl).host) {
    throw new Error(`Sitemap contains an invalid or off-site URL: ${url}`)
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`Sitemap contains a parameterized URL: ${url}`)
  }
}

if (extractedUrls.length !== urls.length) {
  console.log(`Removed ${extractedUrls.length - urls.length} duplicate sitemap URLs before batching`)
}

console.log(`${dryRun ? 'Would submit' : 'Submitting'} ${urls.length} URLs from ${sitemapUrl}`)

if (!dryRun) {
  for (let offset = 0; offset < urls.length; offset += 10_000) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(siteUrl).host,
        key,
        keyLocation: `${siteUrl}/${key}.txt`,
        urlList: urls.slice(offset, offset + 10_000),
      }),
    })

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow rejected the batch (${response.status}): ${await response.text()}`)
    }

    console.log(`Accepted batch ${offset / 10_000 + 1} (${response.status})`)
  }
}
