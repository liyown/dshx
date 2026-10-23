import { PackagePlus } from "lucide-react";
import { FormEvent, useState } from "react";

import { Turnstile } from "./turnstile";
import { useVerifiedWrite } from "./verified-write";
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
import { useI18n } from "@/lib/i18n/use-i18n";
import { ApiError } from "@/lib/api-client";
import { submissionSchema } from "@/lib/community/contracts";

export function PluginSubmissionDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const write = useVerifiedWrite({
    path: () => "/api/submissions",
    schema: submissionSchema,
    keyPrefix: "submission",
    body: (url: string, secrets) => ({ repositoryUrl: url, ...secrets }),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repositoryUrl.trim() || !write.token || write.pending) return;
    setMessage(null);
    try {
      await write.submit(repositoryUrl.trim());
      setRepositoryUrl("");
      setMessage({ tone: "success", text: t("plugins.submissionQueued") });
    } catch (error) {
      if (error instanceof ApiError) {
        const errorKey =
          error.code === "invalid_repository_url" || error.code === "invalid_body"
            ? "plugins.submissionInvalid"
            : error.code === "rate_limited"
              ? "plugins.submissionRateLimited"
              : error.code === "turnstile_failed"
                ? "plugins.submissionVerificationFailed"
                : "plugins.submissionFailed";
        setMessage({ tone: "error", text: t(errorKey) });
      } else {
        setMessage({ tone: "error", text: t("plugins.submissionFailed") });
      }
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
          <Turnstile key={write.widgetKey} mode="direct" onToken={write.receive} />
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
            <Button type="submit" disabled={!repositoryUrl.trim() || !write.token || write.pending}>
              {write.pending ? t("plugins.submitting") : t("plugins.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
