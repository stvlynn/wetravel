import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import type { AgentStatusPart } from "@opentrip/agent-ui-catalog";
import { Button } from "@/shared/ui/button";

export function AgentGeneratedFallback({
  status,
  onRetry,
}: {
  status: AgentStatusPart["data"];
  onRetry: (message: string) => Promise<void>;
}) {
  const { t } = useTranslation("agent");
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (retrying || !status.retryable || !status.retryRequest) return;
    setRetrying(true);
    try {
      const request = status.retryRequest.request;
      await onRetry(
        request.kind === "place"
          ? t("generated.fallback.retryPlaceMessage", {
              place: request.query,
            })
          : t("generated.fallback.retryCoordinateMessage", {
              lat: request.lat,
              longitude: request.lng,
            }),
      );
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
          {t(`generated.fallback.${status.reason}`)}
        </p>
        {status.retryable && status.retryRequest ? (
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
        ) : null}
      </div>
    </div>
  );
}
