import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon, XIcon } from "lucide-react";
import type { Trip } from "@/entities/trip";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib";
import { AgentToolPreview } from "./AgentToolPreview";
import { toolDisplayName } from "./toolDisplayName";

/** Inline card for AI SDK tool parts in `approval-requested` state.
 * Actions call `addToolApprovalResponse({ id, approved })` — same DTO as
 * proactive suggestion approve. The body renders the tool arguments as the
 * planner's own micro-UI (see `AgentToolPreview`), never raw JSON. */
export function AgentToolApprovalCard({
  toolName,
  input,
  trip,
  approvalId,
  canEdit,
  disabled,
  onApprove,
  onDeny,
}: {
  toolName: string;
  input: unknown;
  trip: Trip;
  approvalId: string;
  canEdit: boolean;
  disabled?: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const { t } = useTranslation("agent");
  const label = toolDisplayName(t, toolName);

  return (
    <div
      className={cn(
        "mt-0.5 flex w-full max-w-[92%] flex-col gap-2 rounded-lg border border-border bg-card px-2.5 py-2",
        "shadow-[var(--shadow-border)]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("tool.proposed", { tool: label })}
        </span>
        <AgentToolPreview toolName={toolName} input={input} trip={trip} />
      </div>
      {canEdit ? (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            disabled={disabled}
            onClick={() => onDeny(approvalId)}
          >
            <XIcon className="size-3" />
            {t("approval.deny")}
          </Button>
          <Button
            size="xs"
            disabled={disabled}
            onClick={() => onApprove(approvalId)}
          >
            <CheckIcon className="size-3" />
            {t("approval.approve")}
          </Button>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">
          {t("approval.viewersCannotApprove")}
        </span>
      )}
    </div>
  );
}

/** How long a self-dismissing status line stays before it collapses away. */
const AUTO_DISMISS_MS = 4000;

/** Compact status after the user has responded or the tool finished. When a
 * `preview` is supplied, hovering the line reveals the tool's own micro-UI in a
 * tooltip so members can inspect what was applied without leaving the chat.
 *
 * `autoDismiss` turns the line into a toast: after a short delay it fades and
 * collapses out of the transcript so successful, low-signal "applied" states do
 * not pile up. */
export function AgentToolStatusLine({
  label,
  tone = "muted",
  preview,
  autoDismiss = false,
}: {
  label: string;
  tone?: "muted" | "success" | "danger";
  preview?: ReactNode;
  autoDismiss?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoDismiss) return;
    const id = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [autoDismiss]);

  const line = (
    <div
      className={cn(
        "max-w-[85%] rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-xs",
        tone === "success" && "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
        tone === "danger" && "border-destructive/30 text-destructive",
        tone === "muted" && "text-muted-foreground",
        preview && "cursor-default",
      )}
    >
      {label}
    </div>
  );

  const content = preview ? (
    <Tooltip>
      <TooltipTrigger render={line} />
      <TooltipPopup
        side="left"
        align="start"
        className="max-w-none w-72 border border-border bg-card p-2 text-foreground shadow-md"
      >
        {preview}
      </TooltipPopup>
    </Tooltip>
  ) : (
    line
  );

  if (!autoDismiss) return <div className="mt-0.5">{content}</div>;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          className="mt-0.5 overflow-hidden"
          initial={false}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, height: 0, marginTop: 0, y: -4 }
          }
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          {content}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
