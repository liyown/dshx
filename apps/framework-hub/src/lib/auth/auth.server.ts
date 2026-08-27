import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import { requireBindings } from "@/lib/db/context";
import { createDatabase } from "@/lib/db/client";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  userProfiles,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http";

type GithubMappedUser = {
  id: string;
  name: string;
  image?: unknown;
  githubId?: unknown;
  githubLogin?: unknown;
};

function isGithubOAuthCallback(context: unknown) {
  if (context == null || typeof context !== "object" || !("request" in context)) return false;
  const request = context.request;
  if (request == null || typeof request !== "object" || !("url" in request)) return false;
  return (
    typeof request.url === "string" && new URL(request.url).pathname === "/api/auth/callback/github"
  );
}

export function createAuth(context: unknown) {
  const bindings = requireBindings(context);
  if (!bindings.DB)
    throw new HttpError(503, "Database binding is unavailable", "database_unavailable");
  if (!bindings.BETTER_AUTH_SECRET)
    throw new HttpError(503, "Authentication secret is not configured", "auth_unavailable");

  const db = createDatabase(bindings.DB);
  const bootstrapAdmins = new Set(
    (bindings.HUB_ADMIN_GITHUB_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const syncGithubProfile = async (user: GithubMappedUser) => {
    const githubId = typeof user.githubId === "string" ? user.githubId : "";
    const githubLogin = typeof user.githubLogin === "string" ? user.githubLogin : "";
    if (!githubId || !githubLogin) return;
    await db
      .insert(userProfiles)
      .values({
        userId: user.id,
        githubId,
        githubLogin,
        role: bootstrapAdmins.has(githubId) ? "admin" : "member",
        displayName: user.name,
        avatarUrl: typeof user.image === "string" ? user.image : null,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          githubId,
          githubLogin,
          displayName: user.name,
          avatarUrl: typeof user.image === "string" ? user.image : null,
          updatedAt: new Date(),
        },
      });
  };

  return betterAuth({
    appName: "DSHX Hub",
    baseURL: bindings.SITE_URL,
    basePath: "/api/auth",
    secret: bindings.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    user: {
      additionalFields: {
        githubId: { type: "string", required: false, input: true, returned: false },
        githubLogin: { type: "string", required: false, input: true, returned: false },
      },
    },
    socialProviders:
      bindings.GITHUB_CLIENT_ID && bindings.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: bindings.GITHUB_CLIENT_ID,
              clientSecret: bindings.GITHUB_CLIENT_SECRET,
              overrideUserInfoOnSignIn: true,
              mapProfileToUser: (profile) => ({
                githubId: String(profile.id),
                githubLogin: profile.login,
                name: profile.name || profile.login,
                image: profile.avatar_url,
              }),
            },
          }
        : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            if (("githubId" in user || "githubLogin" in user) && !isGithubOAuthCallback(context))
              return false;
            return true;
          },
          after: syncGithubProfile,
        },
        update: {
          before: async (user, context) => {
            if (("githubId" in user || "githubLogin" in user) && !isGithubOAuthCallback(context))
              return false;
            return true;
          },
          after: syncGithubProfile,
        },
      },
    },
    trustedOrigins: [bindings.SITE_URL ?? "http://localhost:3000"],
    rateLimit: { enabled: true, window: 60, max: 100 },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
  });
}

export async function getOptionalSession(request: Request, context: unknown) {
  const auth = createAuth(context);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const bindings = requireBindings(context);
  const db = createDatabase(bindings.DB!);
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  if (!profile || profile.status === "banned")
    throw new HttpError(403, "Account is unavailable", "forbidden");
  return { session, profile, db };
}

export async function requireSession(request: Request, context: unknown) {
  const result = await getOptionalSession(request, context);
  if (!result) throw new HttpError(401, "Sign in with GitHub first", "unauthorized");
  return result;
}

export async function requireAdminSession(request: Request, context: unknown) {
  const result = await requireSession(request, context);
  if (result.profile.role !== "admin")
    throw new HttpError(403, "Administrator role required", "admin_required");
  return result;
}

export function requireSameOrigin(request: Request, context: unknown) {
  const bindings = requireBindings(context);
  const origin = request.headers.get("origin");
  if (!origin) throw new HttpError(403, "Origin header required", "origin_required");
  const allowedOrigins = new Set([
    new URL(bindings.SITE_URL ?? request.url).origin,
    new URL(request.url).origin,
  ]);
  if (!allowedOrigins.has(origin))
    throw new HttpError(403, "Cross-origin administration is forbidden", "invalid_origin");
}
