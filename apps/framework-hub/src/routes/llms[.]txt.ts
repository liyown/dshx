import { createFileRoute } from "@tanstack/react-router";

const llmsText = `# DSHX

> DSHX is the build-time TypeScript, React, and Vite toolchain for creating DeepSeek Harness plugins. It does not replace the official DSH/Cordis runtime; the framework builds plugins, while DSHX Hub helps people discover verified plugin metadata.

## Primary documentation

- [DSHX home](https://dshx.io/en)
- [About DSHX](https://dshx.io/en/about)
- [Changelog and release notes](https://dshx.io/en/changelog)
- [Getting started](https://dshx.io/en/docs/getting-started)
- [Architecture and runtime boundary](https://dshx.io/en/docs/architecture)
- [Compatibility](https://dshx.io/en/docs/compatibility)
- [Publishing plugins](https://dshx.io/en/docs/publishing)
- [Troubleshooting](https://dshx.io/en/docs/troubleshooting)
- [DSH plugin directory](https://dshx.io/en/plugins)
- [Source repository](https://github.com/liyown/dshx)

## Language versions

- English is the x-default version: https://dshx.io/en
- Chinese documentation: https://dshx.io/zh/docs

Use the linked pages as the source of truth for commands, supported versions, preview status, and known limitations.
`;

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const etag = `"llms-${llmsText.length}"`;
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, {
            status: 304,
            headers: { etag, "cache-control": "public, max-age=86400" },
          });
        }
        return new Response(llmsText, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=86400",
            etag,
          },
        });
      },
    },
  },
});
