import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  JSONUIProvider,
  Renderer,
  defineRegistry,
  useJsonRenderMessage,
  type DataPart,
  type SetState,
} from "@json-render/react";
import {
  agentUiCatalog,
  allowedStreetViewImageIds,
  safeAgentUiSpec,
} from "@opentrip/agent-ui-catalog";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  MapPin,
  ScanLine,
  Sparkles,
} from "lucide-react";
import type { AgentUIMessage } from "../../model/agent-ui-message";
import { cn } from "@/shared/lib";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  ApiError,
  fetchStreetViewImage,
  streetViewPreviewSrc,
} from "@/shared/api";
import { useStreetViewViewer } from "../street-view/StreetViewViewerProvider";

interface AgentGeneratedUiProps {
  parts: AgentUIMessage["parts"];
  streaming: boolean;
  onSendFollowUp: (message: string) => Promise<void>;
  onFocusDay: (dayNumber: number) => void;
  onFocusStop: (stopId: string) => void;
}

const gapClasses = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
} as const;

const alignClasses = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

class GeneratedUiBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Failed to render agent generated UI", error, info);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function GeneratedStreetViewCard({ imageId, placeLabel }: { imageId: string; placeLabel?: string | null }) {
  const { t, i18n } = useTranslation("agent");
  const { tripId, enabled, openStreetView } = useStreetViewViewer();
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [imageId]);
  const query = useQuery({
    queryKey: ["street-view", tripId, "image", imageId],
    queryFn: () => fetchStreetViewImage(tripId, imageId),
    staleTime: 15 * 60 * 1000,
    retry: (failureCount, error) =>
      failureCount < 1 && isTransientStreetViewError(error),
    retryOnMount: false,
  });
  const captured = query.data?.capturedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(query.data.capturedAt),
      )
    : null;
  const locationLabel =
    placeLabel ??
    (query.data
      ? `${query.data.coordinate.lat.toFixed(5)}, ${query.data.coordinate.lng.toFixed(5)}`
      : t("generated.streetView.placeFallback"));

  if (query.isError || previewFailed) {
    const transient =
      previewFailed || isTransientStreetViewError(query.error);
    return (
      <Card className="w-full rounded-xl">
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <p className="text-xs text-muted-foreground">
            {t("generated.streetView.previewUnavailable")}
          </p>
          {transient ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPreviewFailed(false);
                void query.refetch();
              }}
            >
              {t("generated.streetView.retry")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden rounded-xl">
      <div className="aspect-[16/9] w-full bg-muted">
        {query.data && !previewFailed ? (
          <img
            src={streetViewPreviewSrc(query.data.previewUrl)}
            alt={placeLabel ?? t("generated.streetView.previewAlt")}
            className="size-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">
            {query.isError || previewFailed
              ? t("generated.streetView.previewUnavailable")
              : t("generated.streetView.loading")}
          </div>
        )}
      </div>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{locationLabel}</p>
          <p className="text-xs text-muted-foreground">
            {captured ?? t("generated.streetView.captureUnknown")}
            {query.data ? ` · ${query.data.attribution.label}` : ""}
          </p>
        </div>
        {query.data?.supports360 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!enabled}
            onClick={() => openStreetView(imageId)}
          >
            <ScanLine aria-hidden="true" className="size-3.5" />
            {t("generated.streetView.open")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function isTransientStreetViewError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 429 || [502, 503, 504].includes(error.status))
  );
}

export function AgentGeneratedUi({
  parts,
  streaming,
  onSendFollowUp,
  onFocusDay,
  onFocusStop,
}: AgentGeneratedUiProps) {
  const { t, i18n } = useTranslation("agent");
  const { spec, hasSpec } = useJsonRenderMessage(parts as unknown as DataPart[]);
  const safeSpec = useMemo(
    () =>
      spec
        ? safeAgentUiSpec(spec, {
            allowedStreetViewImageIds: allowedStreetViewImageIds(parts),
          })
        : null,
    [parts, spec],
  );

  const runtime = useMemo(() => {
    const definition = defineRegistry(agentUiCatalog, {
      components: {
        Stack: ({ props, children }) => (
          <div
            className={cn(
              "flex min-w-0",
              props.direction === "row" ? "flex-row flex-wrap" : "flex-col",
              gapClasses[props.gap ?? "sm"],
              alignClasses[props.align ?? "stretch"],
            )}
          >
            {children}
          </div>
        ),
        Card: ({ props, children }) => (
          <Card
            className={cn(
              "w-full overflow-hidden rounded-xl",
              props.tone === "highlight" && "bg-brand-muted/45",
              props.tone === "muted" && "bg-muted/55",
            )}
          >
            {props.title || props.description ? (
              <CardHeader className="gap-0.5 p-3 pb-2">
                {props.title ? (
                  <CardTitle className="text-sm">{props.title}</CardTitle>
                ) : null}
                {props.description ? (
                  <p className="text-xs text-pretty text-muted-foreground">
                    {props.description}
                  </p>
                ) : null}
              </CardHeader>
            ) : null}
            {children ? (
              <CardContent className="flex flex-col gap-2 p-3 pt-0">
                {children}
              </CardContent>
            ) : null}
          </Card>
        ),
        Text: ({ props }) => (
          <p
            className={cn(
              "text-pretty",
              props.variant === "heading" && "text-sm font-semibold text-foreground",
              (!props.variant || props.variant === "body") && "text-sm text-foreground",
              props.variant === "caption" && "text-xs text-muted-foreground",
              props.variant === "mono" && "font-mono text-xs text-muted-foreground",
            )}
          >
            {props.content}
          </p>
        ),
        Badge: ({ props }) => (
          <Badge
            variant={
              props.tone === "info"
                ? "info"
                : props.tone === "success"
                  ? "success"
                  : props.tone === "warning"
                    ? "warning"
                    : "neutral"
            }
          >
            {props.label}
          </Badge>
        ),
        Alert: ({ props }) => {
          const Icon =
            props.severity === "success"
              ? CheckCircle2
              : props.severity === "warning"
                ? AlertTriangle
                : props.severity === "critical"
                  ? CircleAlert
                  : Info;
          return (
            <div
              role={props.severity === "critical" ? "alert" : "status"}
              className={cn(
                "flex w-full gap-2 rounded-xl px-3 py-2.5 text-xs",
                props.severity === "success" && "bg-success/10 text-success-foreground",
                props.severity === "warning" && "bg-warning/15 text-warning-foreground",
                props.severity === "critical" && "bg-destructive/10 text-destructive",
                props.severity === "info" && "bg-brand-muted text-corn-700 dark:text-corn-300",
              )}
            >
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                {props.title ? <p className="font-semibold">{props.title}</p> : null}
                <p className="text-pretty">{props.message}</p>
              </div>
            </div>
          );
        },
        DayPlan: ({ props, children }) => (
          <section className="w-full rounded-xl bg-muted/45 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("generated.day", { day: props.dayNumber })}
                </p>
                <h4 className="text-sm font-semibold text-balance text-foreground">
                  {props.title}
                </h4>
              </div>
              {props.date ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {props.date}
                </span>
              ) : null}
            </div>
            {props.summary ? (
              <p className="mb-2 text-xs text-pretty text-muted-foreground">
                {props.summary}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">{children}</div>
          </section>
        ),
        StopSummary: ({ props }) => (
          <div className="flex min-w-0 items-start gap-2 rounded-lg bg-card px-2.5 py-2 shadow-[var(--shadow-border)]">
            <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-corn-600" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                {props.time ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {props.time}
                  </span>
                ) : null}
                <span className="text-xs font-medium text-foreground">{props.name}</span>
              </div>
              {props.category || props.note ? (
                <p className="text-[11px] text-pretty text-muted-foreground">
                  {[props.category, props.note].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        ),
        OptionComparison: ({ props }) => (
          <section className="w-full">
            <h4 className="mb-2 text-sm font-semibold text-balance text-foreground">
              {props.title}
            </h4>
            <div className="grid gap-2">
              {props.options.map((option) => (
                <div
                  key={option.label}
                  className={cn(
                    "rounded-xl bg-card p-3 shadow-[var(--shadow-border)]",
                    option.recommended && "bg-brand-muted/45",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {option.label}
                    </span>
                    {option.recommended ? (
                      <Badge variant="brand">{t("generated.recommended")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {option.summary}
                  </p>
                  {option.pros.length > 0 ? (
                    <p className="mt-1.5 text-[11px] text-success-foreground">
                      <span className="font-medium">{t("generated.pros")}: </span>
                      {option.pros.join(" · ")}
                    </p>
                  ) : null}
                  {option.cons.length > 0 ? (
                    <p className="mt-1 text-[11px] text-warning-foreground">
                      <span className="font-medium">{t("generated.cons")}: </span>
                      {option.cons.join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ),
        BudgetSummary: ({ props }) => {
          const format = new Intl.NumberFormat(i18n.language, {
            style: "currency",
            currency: props.currency,
            maximumFractionDigits: 2,
          });
          return (
            <section className="w-full rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles aria-hidden="true" className="size-3.5 text-corn-600" />
                {t("generated.estimate")}
              </div>
              <dl className="flex flex-col gap-1">
                {props.items.map((item) => (
                  <div key={item.label} className="flex justify-between gap-3 text-xs">
                    <dt className="min-w-0 text-muted-foreground">{item.label}</dt>
                    <dd className="shrink-0 tabular-nums text-foreground">
                      {format.format(item.amount)}
                    </dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-3 border-t border-border pt-1.5 text-xs font-semibold">
                  <dt>{t("generated.total")}</dt>
                  <dd className="tabular-nums">{format.format(props.total)}</dd>
                </div>
              </dl>
            </section>
          );
        },
        StreetViewCard: ({ props }) => (
          <GeneratedStreetViewCard imageId={props.imageId} placeLabel={props.placeLabel} />
        ),
        ActionButton: ({ props, emit }) => (
          <Button
            type="button"
            size="sm"
            variant={props.variant ?? "primary"}
            className="max-w-full"
            onClick={() => emit("press")}
          >
            <span className="truncate">{props.label}</span>
          </Button>
        ),
      },
      actions: {
        sendAgentFollowUp: async (params) => {
          if (params) await onSendFollowUp(params.message);
        },
        focusDay: async (params) => {
          if (params) onFocusDay(params.dayNumber);
        },
        focusStop: async (params) => {
          if (params) onFocusStop(params.stopId);
        },
      },
    });

    let localState: Record<string, unknown> = {};
    const setState: SetState = (updater) => {
      localState = updater(localState);
    };
    return {
      registry: definition.registry,
      handlers: definition.handlers(
        () => setState,
        () => localState,
      ),
    };
  }, [i18n.language, onFocusDay, onFocusStop, onSendFollowUp, t]);

  if (!hasSpec) return null;
  if (!safeSpec) {
    return streaming ? null : (
      <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
        {t("generated.invalid")}
      </p>
    );
  }

  const fallback = (
    <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
      {t("generated.invalid")}
    </p>
  );

  return (
    <GeneratedUiBoundary fallback={fallback}>
      <div className="w-full min-w-0">
        <JSONUIProvider registry={runtime.registry} handlers={runtime.handlers}>
          <Renderer
            spec={safeSpec}
            registry={runtime.registry}
            loading={streaming}
          />
        </JSONUIProvider>
      </div>
    </GeneratedUiBoundary>
  );
}
