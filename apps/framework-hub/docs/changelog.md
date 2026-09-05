# Database-backed website changelog

Public pages at `/en/changelog`, `/zh/changelog`, and their detail URLs read
Cloudflare D1. The `changelog_entries` table stores stable slugs, versions,
publication state and dates, revisions, and bilingual content. List queries select
only summaries; detail queries load the requested article. No release content is
bundled with the frontend.

## Maintain content

Use the existing Hub bearer token with `catalog:write`. These operations are also
discoverable through `/openapi.json` and `/api-docs.md`:

| Method | Endpoint                       | Purpose                                           |
| ------ | ------------------------------ | ------------------------------------------------- |
| GET    | `/api/ops/v1/changelog`        | List published entries and drafts, with revisions |
| POST   | `/api/ops/v1/changelog`        | Create an entry                                   |
| GET    | `/api/ops/v1/changelog/{slug}` | Read the complete current entry                   |
| PUT    | `/api/ops/v1/changelog/{slug}` | Edit, publish, or withdraw an entry               |

Create with this structure (replace the example content and release date):

```json
{
  "slug": "hub-release-1-0",
  "product": "Hub",
  "version": "1.0.0",
  "channel": "release",
  "status": "draft",
  "publishedAt": "2026-09-05",
  "content": {
    "en": {
      "title": "Release title",
      "description": "A concise summary of what changed.",
      "sections": [{ "id": "changes", "title": "Changes", "paragraphs": ["Release details."] }],
      "links": [{ "label": "Release source", "href": "https://github.com/liyown/dshx" }]
    },
    "zh": {
      "title": "更新标题",
      "description": "简要说明这次更新的变化。",
      "sections": [{ "id": "changes", "title": "本次变化", "paragraphs": ["更新详情。"] }],
      "links": [{ "label": "发布来源", "href": "https://github.com/liyown/dshx" }]
    }
  }
}
```

To update, send the same editable fields without `slug` and include `ifRevision`
from the latest GET response. Set `status` to `published` to publish or `draft` to
withdraw. A conflicting revision returns 409; fetch the current record and merge
before retrying. Slugs are permanent. Duplicate creates return 409 and never
replace existing content. Publication dates cannot be in the future.

Both translations are required. Sections may contain `paragraphs`, `items`, or
both. Content is rendered as text; HTML is not executed. External links must use
HTTPS. A draft is unavailable through the public loaders and returns HTTP 404 at
its detail URL. An operator can still read and edit it through the protected API.

## Deployment and SEO

Apply `0011_hub_changelog.sql` before deploying the Worker. It creates the table
and imports three historical release records once. Subsequent content changes go
through the API and do not require rebuilding or deploying the website.

Page titles, descriptions, canonical URLs, bilingual alternates, sharing metadata,
and Article/Breadcrumb JSON-LD are derived from the same D1 records as the visible
page. Sitemap entries include published records only and use stored modification
times. Mutations invalidate both sitemap cache generations. Changelog pages use
`no-store` so a withdrawn or edited article is not served from an old page cache.

The focused tests cover actual local D1 persistence, publication/withdrawal,
revision conflicts, API permissions, content validation, and SEO serialization.
The markup follows Google's [Article documentation](https://developers.google.com/search/docs/appearance/structured-data/article)
and [localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).
