import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiKeys, apiRequest } from "@/lib/api-client";
import {
  pluginReviewPageSchema,
  type PluginReviewReplyView,
  type PluginReviewView,
} from "@/lib/catalog/contracts";

/**
 * The review thread of one plugin.
 *
 * Reading it, knowing how much of it to read, and telling the page that it
 * changed were three decisions spread over three modules: the page built its
 * own `?limit=50` URL and used that URL as the cache key, the review form
 * announced a change by dispatching a `dshx:reviews-changed` window event, and
 * the reply dialog connected back to the same event through a callback prop.
 * A page listening to the event and a page that had forgotten to were both
 * plausible states.
 *
 * The thread is now one module: it owns the query key, the page size, the
 * reading, and what a successful write does to the page. `replies` arrives as a
 * JSON string on drivers that do not parse JSON columns, so the module also
 * owns turning a row into the entry the page renders.
 */

/** One page is the whole thread the product shows; there is no "load more". */
const THREAD_LIMIT = 50;

function threadPath(slug: string): string {
  return `/api/plugins/${encodeURIComponent(slug)}/reviews?limit=${THREAD_LIMIT}`;
}

/** The cache key a write invalidates and the page reads. */
export function reviewThreadKey(slug: string) {
  return apiKeys.endpoint(threadPath(slug));
}

export type ReviewThreadEntry = PluginReviewView & { readonly replies: PluginReviewReplyView[] };

function entry(review: PluginReviewView): ReviewThreadEntry {
  if (Array.isArray(review.replies)) return { ...review, replies: review.replies };
  try {
    const parsed: unknown = JSON.parse(review.replies || "[]");
    return { ...review, replies: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { ...review, replies: [] };
  }
}

/** Invalidate the thread after a write made anywhere else on the page. */
export function useReviewThreadRefresh(slug: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: reviewThreadKey(slug) }),
    [queryClient, slug],
  );
}

export function useReviewThread(slug: string) {
  const query = useQuery({
    queryKey: reviewThreadKey(slug),
    queryFn: ({ signal }) => apiRequest(threadPath(slug), pluginReviewPageSchema, { signal }),
  });
  const refresh = useReviewThreadRefresh(slug);
  // A failed read shows the same empty state as an empty thread; a null list is
  // the loading state the panel renders before either is known.
  const entries = query.data ? query.data.items.map(entry) : query.isError ? [] : null;
  return { entries, refresh };
}
