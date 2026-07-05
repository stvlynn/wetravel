import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTrip, fetchTrips } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppSidebar } from "@/widgets/app-sidebar";
import { Spinner } from "@/shared/ui/spinner";
import { useRouter } from "@/app/router";
import { TripCard } from "./ui/TripCard";

/** Placeholder title for an instantly-created trip. Users rename it later. */
function defaultTripName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `new-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function TripsPage() {
  const { t } = useTranslation("trips");
  const { navigate } = useRouter();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.trips,
    queryFn: fetchTrips,
  });

  const create = useMutation({
    mutationFn: () => createTrip({ title: defaultTripName() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });

  const creating = create.isPending;

  return (
    <div className="flex h-dvh bg-sidebar">
      <AppSidebar>
        <nav className="flex flex-col px-2.5 pt-1">
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={creating}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-[background-color,color,scale] duration-150 hover:bg-accent active:scale-[0.96] disabled:opacity-50"
          >
            <span
              className="wf-icon-swap inline-flex size-4 items-center justify-center text-corn-600"
              data-state={creating ? "active" : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              <Spinner className="size-4" />
            </span>
            {t("newTrip")}
          </button>
        </nav>
      </AppSidebar>

      <main className="min-w-0 flex-1 overflow-y-auto rounded-l-2xl border border-r-0 border-border bg-background shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25)]">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12">
          <div className="wf-enter-stagger mb-8 flex flex-col gap-1">
            <h1 className="wf-enter text-3xl font-semibold tracking-[-0.02em]">
              {t("title")}
            </h1>
            <p className="wf-enter text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>

          {isPending ? (
            <div className="wf-enter flex justify-center py-16">
              <Spinner className="size-6" />
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : data.length === 0 && !creating ? (
            <EmptyState onCreate={() => create.mutate()} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {creating && <SkeletonCard />}
              {data.map((trip, i) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  index={i}
                  onOpen={() => navigate(`/trips/${trip.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation("trips");
  return (
    <div className="relative min-h-[520px]">
      {/* Faint skeleton grid hints at the card layout behind the CTA. */}
      <div
        aria-hidden="true"
        className="pointer-events-none grid select-none grid-cols-1 gap-4 opacity-70 [mask-image:linear-gradient(to_bottom,#000_0%,#000_35%,transparent_88%)] sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div className="wf-enter-stagger flex w-full max-w-[520px] flex-col items-center gap-5">
          <p className="wf-enter text-base font-semibold text-pretty">{t("empty.title")}</p>
          <button
            type="button"
            onClick={onCreate}
            className="wf-enter group flex w-full items-center gap-3 rounded-xl bg-card/85 px-3.5 py-3 text-left shadow-[var(--shadow-border)] backdrop-blur-md transition-[background-color,color,scale,box-shadow] duration-150 hover:bg-accent hover:shadow-[var(--shadow-border-hover)] active:scale-[0.96]"
          >
            <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-accent text-corn-600 transition-[background-color] group-hover:bg-brand-muted">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">{t("newTrip")}</span>
              <span className="text-xs text-pretty text-muted-foreground">
                {t("empty.subtitle")}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Non-interactive placeholder matching the TripCard silhouette. */
function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
      <div className="h-24 w-full animate-pulse bg-muted" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="wf-enter flex flex-col items-center gap-3 py-16">
      <p className="text-sm text-pretty text-muted-foreground">{t("state.error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center justify-center text-sm text-corn-600 transition-[color,scale] duration-150 hover:underline active:scale-[0.96]"
      >
        {t("state.retry")}
      </button>
    </div>
  );
}
