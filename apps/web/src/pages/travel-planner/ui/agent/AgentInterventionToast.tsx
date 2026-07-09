import { useTranslation } from "react-i18next";
import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import type { AgentSuggestion } from "@/shared/api";
import { Button } from "@/shared/ui/button";

/** Non-blocking intervention cards in the bottom-right corner. Each pending
 * suggestion offers ADR actions: approve, discuss, deny — approve/deny use the
 * same `{ id, approved }` shape as AI SDK tool approval. */
export function AgentInterventionToasts({
  suggestions,
  canEdit,
  applyingId,
  onApprove,
  onDiscuss,
  onDeny,
}: {
  suggestions: AgentSuggestion[];
  canEdit: boolean;
  applyingId: string | null;
  onApprove: (suggestion: AgentSuggestion) => void;
  onDiscuss: (suggestion: AgentSuggestion) => void;
  onDeny: (suggestion: AgentSuggestion) => void;
}) {
  const { t } = useTranslation("agent");
  if (suggestions.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="wf-enter rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-[var(--shadow-border),var(--shadow-lg)]"
        >
          <div className="flex items-start gap-2">
            <SparklesIcon className="mt-0.5 size-4 flex-none text-corn-600" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-pretty">{s.reason}</span>
              <span className="text-xs text-pretty text-muted-foreground">
                {s.suggestionText}
              </span>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => onDeny(s)}>
              <XIcon className="size-3" />
              {t("approval.deny")}
            </Button>
            <Button size="xs" variant="outline" onClick={() => onDiscuss(s)}>
              {t("toast.discuss")}
            </Button>
            {canEdit ? (
              <Button
                size="xs"
                disabled={applyingId === s.id}
                onClick={() => onApprove(s)}
              >
                <CheckIcon className="size-3" />
                {t("approval.approve")}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
