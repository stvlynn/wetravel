import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import type { AgentUiFallbackReason } from "@opentrip/agent-ui-catalog";
import { Button } from "@/shared/ui/button";

export function AgentGeneratedFallback({
  reason,
  onRetry,
}: {
  reason: AgentUiFallbackReason;
  onRetry: (message: string) => Promise<void>;
}) {
  const { t } = useTranslation("agent");
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry(t("generated.fallback.retryMessage"));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className="flex w-full items-start gap-2 rounded-xl border border-border bg-card p-3"
      role="status"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t("generated.fallback.title")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(`generated.fallback.${reason}`)}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={retrying}
          onClick={() => void handleRetry()}
        >
          {retrying
            ? t("generated.fallback.retrying")
            : t("generated.fallback.retry")}
        </Button>
      </div>
    </div>
  );
}
