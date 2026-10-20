# TODO

Open work that is not API surface and therefore not tracked in [ROADMAP.md](./ROADMAP.md).
Backlink research and channel maintenance live in the Obsidian library at
`知识库/seo外链资源/` (CSV ledger, rejection list, work log).

## Distribution and backlinks

Derived from the 2026-10-20 competitor backlink study: the DSH market sites rank on
content-platform articles and README badges, not on directory submissions or paid links.

### Unblock automatic indexing

- [ ] Add the `dsh-plugin` topic to this repository. The repo already ships
      `packages/plugin-marketplace` (`@becomeopc/dshx-plugin-marketplace`, declares
      `dsh.bundle.patch`), so the topic is accurate.
      *Acceptance:* listed on dsh-plugin.org, dsh-hub.cc, skillhub.cn, duink.com,
      dsharness.org, and dsh-plugin.com without manual submission (all five read the
      `dsh-plugin` topic; duink.com also requires `deepseek-harness`).
- [ ] Publish `@becomeopc/dshx-plugin-marketplace` at the current version. npm still shows
      `0.1.0-preview.0` while the workspace is on `0.2.0-preview.0`, so catalogues index a stale release.
- [ ] Make repository metadata consistent: `description`, `homepage`, and `keywords` on the
      `liyown/dshx` repo should name DSHX and link `https://dshx.io`.

### Submit to directories that require it

- [ ] dsh-plugin.market — `/submit` form.
- [ ] dshplugin.io — GitHub issue, label `plugin-submission`.
- [ ] dsh.directory — GitHub issue template.
- [ ] dshhub.org — GitHub issue template (`submit-plugin.yml`).
- [ ] dsh.pub — `/en/submit/`.
- [ ] dshbase.com — `/contact/` form or `hello@dshbase.com`.
- [ ] dshmarket.com — add to `dsh-plugin-catalog` (npm index consumed by DSH Discover).
- [ ] awesome-deepseek-harness — pull request; the list currently does not mention DSHX.
- [ ] deepseek-harness-plugin.com — `/submit` form (repo, name, category, description, email).
- [ ] deepseekharnessplugins.com — `/submit` (GitHub repo + email, manual review).
- [ ] deepseekplugin.org — `/submit`, paste a public GitHub URL; auto-indexed if it detects dsh.
- [ ] dshplugins.ai — `/submit` (repo URL + email, manual review).
- [ ] dshpluginhub.dev — `/submit`, accepts an npm package, repo, or install command.
- [ ] cordis.run — `/submit` requires login. Note its rule: a link back gets a "fast track"
      (24 h auto-publish); without one it queues for manual review. Decide before using it.

### Content that earns dofollow links

- [ ] Publish a real DSH plugin tutorial on Aliyun Developer Community, CSDN, and Tencent Cloud
      Developer Community. One article each, runnable example, link to DSHX in the body.
      *Do not* cross-post the same text verbatim; each audience needs its own angle.
- [ ] Add a copyable "Built with DSHX" badge and snippet to the docs, so plugin authors can
      link back from their own READMEs.

### Brand

- [ ] `dshx` collides with unrelated projects (`why913/dshx`, and `dshx` used as a topic by
      third-party repos). Keep `DSHX` + `dshx.io` in the repo description and README first
      paragraph so search results resolve to this project.

### Verify after publishing

- [ ] For each live listing, check the `<a rel>` value and record it in the library ledger.
- [ ] Re-run the competitor backlink report monthly and update the ledger.
