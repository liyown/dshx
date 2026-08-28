export type AppBindings = Partial<Env> & {
  DB?: D1Database;
  PLUGIN_MEDIA?: R2Bucket;
  SITE_URL?: string;
  GOOGLE_SITE_VERIFICATION?: string;
  BING_SITE_VERIFICATION?: string;
  HUB_ADMIN_GITHUB_IDS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type AppRequestContext = {
  cloudflare: AppBindings;
};

declare module "@tanstack/react-router" {
  interface Register {
    server: {
      requestContext: AppRequestContext;
    };
  }
}

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: AppRequestContext;
    };
  }
}

export function requireBindings(context: unknown): AppBindings {
  if (
    context == null ||
    typeof context !== "object" ||
    !("cloudflare" in context) ||
    context.cloudflare == null ||
    typeof context.cloudflare !== "object"
  ) {
    throw new Error("Cloudflare bindings are unavailable");
  }
  return context.cloudflare as AppBindings;
}
