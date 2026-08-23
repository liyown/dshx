import { createTranslator, type Locale } from "./i18n";

export function renderErrorPage(locale: Locale = "en"): string {
  const t = createTranslator(locale);
  return [
    "<!doctype html>",
    '<html lang="' + locale + '">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>" + t("errors.pageLoadFailed") + "</title>",
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "    <style>",
    "      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }",
    "      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }",
    "      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }",
    "      p { color: #4b5563; margin: 0 0 1.5rem; }",
    "      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }",
    "      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }",
    "      .primary { background: #111; color: #fff; }",
    "      .secondary { background: #fff; color: #111; border-color: #d1d5db; }",
    "    </style>",
    "  </head>",
    "  <body>",
    '    <div class="card">',
    "      <h1>" + t("errors.pageLoadFailed") + "</h1>",
    "      <p>" + t("errors.pageLoadFailedBody") + "</p>",
    '      <div class="actions">',
    '        <button class="primary" onclick="location.reload()">' + t("errors.tryAgain") + "</button>",
    '        <a class="secondary" href="/' + locale + '">' + t("errors.goHome") + "</a>",
    "      </div>",
    "    </div>",
    "  </body>",
    "</html>",
  ].join("\n");
}
