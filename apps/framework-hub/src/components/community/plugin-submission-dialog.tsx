import { PackagePlus } from "lucide-react";
import { FormEvent, useCallback, useRef, useState } from "react";

import { Turnstile } from "./turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

type SubmissionResponse = {
  error?: { code?: string; message?: string };
};

export function PluginSubmissionDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const receiveToken = useCallback((nextToken: string) => setToken(nextToken), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repositoryUrl.trim() || !token || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      idempotencyKey.current ??= `submission:${crypto.randomUUID()}`;
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: repositoryUrl.trim(),
          turnstileToken: token,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = (await response.json()) as SubmissionResponse;
      if (!response.ok) {
        const errorKey =
          payload.error?.code === "invalid_repository_url" || payload.error?.code === "invalid_body"
            ? "plugins.submissionInvalid"
            : payload.error?.code === "rate_limited"
              ? "plugins.submissionRateLimited"
              : payload.error?.code === "turnstile_failed"
                ? "plugins.submissionVerificationFailed"
                : "plugins.submissionFailed";
        setMessage({ tone: "error", text: t(errorKey) });
      } else {
        setRepositoryUrl("");
        idempotencyKey.current = null;
        setMessage({ tone: "success", text: t("plugins.submissionQueued") });
      }
    } catch {
      setMessage({ tone: "error", text: t("plugins.submissionFailed") });
    } finally {
      setToken("");
      setChallenge((value) => value + 1);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setMessage(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0 sm:mt-1">
          <PackagePlus data-icon="inline-start" />
          {t("plugins.submit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("plugins.submissionTitle")}</DialogTitle>
            <DialogDescription>{t("plugins.submissionDescription")}</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="plugin-submission-repository">
              {t("plugins.submissionRepository")}
            </Label>
            <Input
              id="plugin-submission-repository"
              type="url"
              inputMode="url"
              autoComplete="url"
              required
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              className="mt-2"
            />
          </div>
          <Turnstile key={challenge} mode="direct" onToken={receiveToken} />
          {message ? (
            <p
              className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-ok"}
              role={message.tone === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("plugins.submissionCancel")}
            </Button>
            <Button type="submit" disabled={!repositoryUrl.trim() || !token || submitting}>
              {submitting ? t("plugins.submitting") : t("plugins.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
