import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import { AdminHeader } from "@/components/admin/approval-ui";
import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api-client";
import { blogContentSchema, blogSlugSchema, type BlogSection } from "@/lib/blog.contracts";
import {
  blogBodyHelp,
  parseBlogBody,
  preserveSectionIds,
  serializeBlogBody,
} from "@/lib/blog-editor";

const blogEditorSchema = z.object({
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number(),
  publishedAt: z.string(),
  coverImageUrl: z.string().nullable(),
  relatedPluginSlugs: z.array(z.string()),
  content: blogContentSchema,
  updatedAt: z.string(),
});

type BlogEditorData = z.infer<typeof blogEditorSchema>;

type LocaleDraft = { title: string; description: string; body: string };

const emptyDraft: LocaleDraft = { title: "", description: "", body: "" };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BlogEditor({ slug }: { slug?: string }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState({
    postSlug: "",
    status: "draft" as "draft" | "published",
    publishedAt: today(),
    coverImageUrl: "",
    related: "",
  });
  const [en, setEn] = useState<LocaleDraft>(emptyDraft);
  const [zh, setZh] = useState<LocaleDraft>(emptyDraft);
  const [revision, setRevision] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storedSections = useRef<Record<"en" | "zh", readonly BlogSection[]>>({ en: [], zh: [] });

  const query = useQuery({
    queryKey: ["admin", "blog", slug ?? "new"],
    queryFn: ({ signal }) =>
      apiRequest(`/api/admin/blog/${encodeURIComponent(slug as string)}`, blogEditorSchema, {
        signal,
      }),
    enabled: Boolean(slug),
  });
  const loaded = query.data;

  useEffect(() => {
    if (!loaded) return;
    setMeta({
      postSlug: loaded.slug,
      status: loaded.status,
      publishedAt: loaded.publishedAt,
      coverImageUrl: loaded.coverImageUrl ?? "",
      related: loaded.relatedPluginSlugs.join(", "),
    });
    storedSections.current = { en: loaded.content.en.sections, zh: loaded.content.zh.sections };
    setEn({
      title: loaded.content.en.title,
      description: loaded.content.en.description,
      body: serializeBlogBody(loaded.content.en.sections),
    });
    setZh({
      title: loaded.content.zh.title,
      description: loaded.content.zh.description,
      body: serializeBlogBody(loaded.content.zh.sections),
    });
    setRevision(loaded.revision);
    setError(null);
    setMessage(null);
  }, [loaded]);

  async function save() {
    setError(null);
    setMessage(null);
    if (slug && revision === null) {
      setError("The article is still loading. Try again once it appears.");
      return;
    }
    const postSlug = slug ?? meta.postSlug.trim();
    if (!blogSlugSchema.safeParse(postSlug).success) {
      setError("Slug must use lowercase letters, numbers, and single hyphens.");
      return;
    }
    const relatedPluginSlugs = [
      ...new Set(
        meta.related
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const payload = {
      publishedAt: meta.publishedAt,
      status: meta.status,
      coverImageUrl: meta.coverImageUrl.trim() || null,
      content: {
        en: {
          title: en.title.trim(),
          description: en.description.trim(),
          sections: preserveSectionIds(parseBlogBody(en.body, "en"), storedSections.current.en),
        },
        zh: {
          title: zh.title.trim(),
          description: zh.description.trim(),
          sections: preserveSectionIds(parseBlogBody(zh.body, "zh"), storedSections.current.zh),
        },
      },
      relatedPluginSlugs,
      ...(slug ? { ifRevision: revision } : { slug: postSlug }),
    };
    setSaving(true);
    try {
      const result = await apiRequest<BlogEditorData>(
        slug ? `/api/admin/blog/${encodeURIComponent(slug)}` : "/api/admin/blog",
        blogEditorSchema,
        { method: slug ? "PUT" : "POST", json: payload },
      );
      storedSections.current = {
        en: payload.content.en.sections,
        zh: payload.content.zh.sections,
      };
      setRevision(result.revision);
      setMessage("Article saved from D1.");
      if (!slug)
        await navigate({
          to: "/admin/blog/$slug",
          params: { slug: result.slug },
          replace: true,
        });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The article could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Blog" />
      <main className="mx-auto max-w-[1100px] px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
              {slug ? "Edit article" : "New article"}
            </p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight">
              {slug ? meta.postSlug || slug : "Write a blog post"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Bilingual content is required. The article is stored in D1 and published without a
              rebuild.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {revision !== null ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                revision {revision}
              </span>
            ) : null}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save article"}
            </Button>
          </div>
        </div>

        {query.isError ? (
          <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Article could not be loaded."}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-6 rounded-md border border-border bg-surface-2 p-4 text-sm">{message}</p>
        ) : null}

        <section className="mt-8 grid gap-5 border-b border-border pb-8 md:grid-cols-2">
          <Field
            label="Slug"
            hint="Lowercase letters, numbers, and hyphens. Immutable after create."
          >
            <input
              className={inputClass}
              value={slug ?? meta.postSlug}
              disabled={Boolean(slug)}
              onChange={(event) => setMeta({ ...meta, postSlug: event.target.value })}
              placeholder="building-your-first-dsh-plugin"
            />
          </Field>
          <Field label="Publication date" hint="Published articles cannot use a future date.">
            <input
              type="date"
              className={inputClass}
              value={meta.publishedAt}
              onChange={(event) => setMeta({ ...meta, publishedAt: event.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={meta.status}
              onChange={(event) =>
                setMeta({ ...meta, status: event.target.value as "draft" | "published" })
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
          <Field
            label="Cover image URL"
            hint="Optional HTTPS image used in the article and social card."
          >
            <input
              className={inputClass}
              value={meta.coverImageUrl}
              onChange={(event) => setMeta({ ...meta, coverImageUrl: event.target.value })}
              placeholder="https://…"
            />
          </Field>
          <div className="md:col-span-2">
            <Field
              label="Related plugins"
              hint="Comma-separated plugin slugs. Published relationships appear as plugin cards."
            >
              <input
                className={inputClass}
                value={meta.related}
                onChange={(event) => setMeta({ ...meta, related: event.target.value })}
                placeholder="dshx-example-bundle"
              />
            </Field>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {(
            [
              ["English", "en", en, setEn],
              ["中文", "zh", zh, setZh],
            ] as const
          ).map(([label, locale, draft, setDraft]) => (
            <section key={locale} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold">{label}</h2>
              <Field label="Title">
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </Field>
              <Field label="Description" hint="Shown in the article list and search metadata.">
                <textarea
                  className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </Field>
              <Field label="Body" hint={blogBodyHelp(locale)}>
                <textarea
                  className="min-h-[26rem] w-full rounded-md border border-border bg-background p-3 font-mono text-[12.5px] leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  placeholder={
                    "## Getting started\n\nA paragraph of text.\n\n- First point\n- Second point"
                  }
                />
              </Field>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save article"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setMessage(null);
              setError(null);
              if (slug) void query.refetch();
            }}
          >
            Reload from D1
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Saving replaces the article and its related plugins.
          </span>
        </div>
      </main>
    </div>
  );
}
