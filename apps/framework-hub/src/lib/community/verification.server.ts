import { parse, serialize } from "cookie";
import { jwtVerify, SignJWT } from "jose";

import { requireBindings } from "@/lib/db/context";
import { HttpError } from "@/lib/http";

const COOKIE_NAME = "dshx_human_verification";
const VERIFICATION_TTL_SECONDS = 30 * 60;
const encoder = new TextEncoder();
const JWT_ISSUER = "dshx-hub";
const JWT_AUDIENCE = "community-write";

function signingKey(context: unknown) {
  const secret = requireBindings(context).BETTER_AUTH_SECRET;
  if (!secret)
    throw new HttpError(503, "Human verification is unavailable", "verification_unavailable");
  return encoder.encode(secret);
}

export async function getCommunityVerificationExpiry(
  request: Request,
  context: unknown,
  userId: string,
  now = Date.now(),
) {
  const proof = parse(request.headers.get("cookie") ?? "")[COOKIE_NAME];
  if (!proof) return null;

  try {
    const { payload } = await jwtVerify(proof, signingKey(context), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: new Date(now),
    });
    if (payload.sub !== userId || typeof payload.exp !== "number") return null;
    return payload.exp * 1_000;
  } catch {
    return null;
  }
}

export async function createCommunityVerification(
  context: unknown,
  userId: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = issuedAt + VERIFICATION_TTL_SECONDS;
  const proof = await new SignJWT()
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(signingKey(context));
  return {
    expiresAt: expiresAt * 1_000,
    cookie: serialize(COOKIE_NAME, proof, {
      path: "/",
      maxAge: VERIFICATION_TTL_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: (requireBindings(context).SITE_URL ?? "").startsWith("https://"),
    }),
  };
}

export async function verifyTurnstileToken(
  request: Request,
  context: unknown,
  turnstileToken: string,
) {
  const secret = requireBindings(context).TURNSTILE_SECRET_KEY;
  if (!secret) throw new HttpError(503, "Turnstile is not configured", "turnstile_unavailable");

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", turnstileToken);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.set("remoteip", ip);

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
  } catch {
    throw new HttpError(
      503,
      "Human verification is temporarily unavailable",
      "turnstile_unavailable",
    );
  }
  if (!response.ok)
    throw new HttpError(
      503,
      "Human verification is temporarily unavailable",
      "turnstile_unavailable",
    );
  const verification = (await response.json()) as { success?: boolean };
  if (!verification.success)
    throw new HttpError(422, "Turnstile verification failed", "turnstile_failed");
}
