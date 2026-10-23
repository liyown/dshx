import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ZodType } from "zod";

import { apiRequest } from "@/lib/api-client";
import { authClient } from "@/lib/auth/client";
import { useHydrated } from "@/lib/use-hydrated";

export type VerifiedMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * One human proof, shared by every write a page offers.
 *
 * A Turnstile token verifies once, so a page with three buttons still mounts
 * one widget: the token it hands over is spent by whichever write runs first,
 * and `reset` remounts the widget for the next one.
 */
export type HumanChallenge = {
  readonly token: string;
  /** Remount key for the widget; it must change after every submit. */
  readonly widgetKey: number;
  readonly receive: (token: string) => void;
  readonly reset: () => void;
};

export function useVerification(): HumanChallenge {
  const [token, setToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);
  const receive = useCallback((next: string) => setToken(next), []);
  const reset = useCallback(() => {
    setToken("");
    setWidgetKey((value) => value + 1);
  }, []);
  return useMemo(() => ({ token, widgetKey, receive, reset }), [token, widgetKey, receive, reset]);
}

/**
 * The protocol every community write shares.
 *
 * A write that changes something on someone else's behalf has to prove a
 * human asked for it: a Turnstile token, a challenge the widget may verify
 * once, a stable idempotency key so a retry after a dropped response does not
 * submit twice, and a session that exists before the control renders at all.
 * That protocol used to be copied into each dialog, and the copies had already
 * drifted — only one of them kept its key across a retry, which is the one
 * case the key exists for.
 *
 * The hook owns the protocol; the caller owns the path, the body, and what to
 * say when it fails. Pass `verification` when the page already has one, so
 * several writes share a single widget.
 */
export function useVerifiedWrite<Input, Result>(options: {
  readonly path: (input: Input) => string;
  readonly schema: ZodType<Result>;
  /** PUT or DELETE may depend on what is being written, e.g. follow/unfollow. */
  readonly method?: VerifiedMethod | ((input: Input) => VerifiedMethod);
  /** Namespaces the idempotency key, e.g. `"report"` or `"review"`. */
  readonly keyPrefix: string;
  readonly verification?: HumanChallenge;
  readonly body: (
    input: Input,
    secrets: { turnstileToken: string; idempotencyKey: string },
  ) => unknown;
}) {
  const own = useVerification();
  const verification = options.verification ?? own;
  const idempotencyKey = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: Input) => {
      // One key per logical submission: reused while the caller retries,
      // replaced once the write has landed.
      idempotencyKey.current ??= `${options.keyPrefix}:${crypto.randomUUID()}`;
      return apiRequest(options.path(input), options.schema, {
        method:
          typeof options.method === "function" ? options.method(input) : (options.method ?? "POST"),
        json: options.body(input, {
          turnstileToken: verification.token,
          idempotencyKey: idempotencyKey.current,
        }),
      });
    },
  });

  const submit = useCallback(
    async (input: Input) => {
      try {
        const result = await mutation.mutateAsync(input);
        idempotencyKey.current = null;
        return result;
      } finally {
        // A challenge verifies one token, so the widget mounts again whether
        // the write landed or not.
        verification.reset();
      }
    },
    [mutation, verification],
  );

  return useMemo(
    () => ({
      ...verification,
      submit,
      pending: mutation.isPending,
      /** Which input is in flight, so a page with several writes can say. */
      pendingInput: mutation.isPending ? mutation.variables : undefined,
      error: mutation.error,
    }),
    [verification, submit, mutation.isPending, mutation.variables, mutation.error],
  );
}

/**
 * The signed-in viewer, or `null` while the page is still hydrating or nobody
 * is signed in. A write control renders only when this is non-null: rendering
 * earlier is what made these dialogs flash a form that could not submit.
 *
 * It returns the session rather than a boolean so a caller that needs the
 * viewer's own id — "you cannot block yourself" — reads it here instead of
 * subscribing to the session a second time.
 */
export function useVerifiedViewer() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  return hydrated ? (session.data ?? null) : null;
}
