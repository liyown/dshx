import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Decision = "approve" | "reject" | "request_changes" | "retry";

const copy: Record<Decision, { label: string; title: string; description: string }> = {
  approve: {
    label: "Approve effect",
    title: "Approve this immutable effect?",
    description:
      "The server will recheck the evidence hash and target state before applying the registered effect.",
  },
  reject: {
    label: "Reject",
    title: "Reject this approval?",
    description:
      "The proposed effect will be superseded. The rejection reason becomes part of the audit log.",
  },
  request_changes: {
    label: "Request evidence",
    title: "Return this request for revision?",
    description:
      "The Agent must submit a new immutable version with fresh evidence before this can be reviewed again.",
  },
  retry: {
    label: "Retry effect",
    title: "Retry the failed effect?",
    description:
      "The effect will run once with the original approved parameters. There is no automatic retry loop.",
  },
};

export function ApprovalDecisionDialog({
  action,
  disabled,
  pending,
  onConfirm,
}: {
  action: Decision;
  disabled?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const required = action === "reject" || action === "request_changes";
  const destructive = action === "reject";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={destructive ? "destructive" : action === "approve" ? "default" : "outline"}
          disabled={disabled || pending}
        >
          {copy[action].label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy[action].title}</AlertDialogTitle>
          <AlertDialogDescription>{copy[action].description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`decision-${action}`}>
            {required ? "Reason (required)" : "Audit note"}
          </Label>
          <Textarea
            id={`decision-${action}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2_000}
            placeholder={
              required
                ? "Explain what must change or why this is rejected."
                : "Optional context for the audit log."
            }
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
            disabled={pending || (required && reason.trim().length < 3)}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm(reason.trim()).then(() => {
                setReason("");
                setOpen(false);
              });
            }}
          >
            {pending ? "Recording…" : copy[action].label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
