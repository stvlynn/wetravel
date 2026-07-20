import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { fetchTrips } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { AppSidebar } from "@/widgets/app-sidebar";
import { UserMenu } from "@/widgets/user-menu";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { useRouter } from "@/app/router";
import { useIsMiniappEmbedded } from "@/app/embedded-environment";
import { useDocumentTitle } from "@/shared/lib";
import { TripCard } from "./ui/TripCard";
import { CreateTripWizardDialog } from "./ui/CreateTripWizardDialog";

export function TripsPage() {
  const { t } = useTranslation("trips");
  const { t: tc } = useTranslation("common");
  const { navigate } = useRouter();
  const embedded = useIsMiniappEmbedded();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Labels the native navigation bar inside the Mini Program WebView.
  useDocumentTitle(embedded ? tc("appName") : undefined);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.trips,
    queryFn: fetchTrips,
  });

  return (
    <div className="flex h-dvh bg-sidebar">
      <AppSidebar className="max-md:hidden" />

      <main className="min-w-0 flex-1 overflow-y-auto rounded-l-2xl border border-r-0 border-border bg-background shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25)] max-md:rounded-none max-md:border-0 max-md:shadow-none">
        <div className="flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 md:hidden">
          {/* The native navigation bar already shows the brand when embedded. */}
          {embedded ? <span aria-hidden="true" /> : (
            <span className="font-heading text-lg font-semibold">
              {tc("appName")}
            </span>
          )}
          <UserMenu compact direction="down" />
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-3xl font-semibold tracking-[-0.02em] text-balance">
                {t("title")}
              </h1>
              <p className="text-sm text-pretty text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
            <Button
              variant="brand"
              size="md"
              onClick={() => setWizardOpen(true)}
              className="shrink-0"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              {t("newTrip")}
            </Button>
          </div>

          {isPending ? (
            <div className="flex justify-center py-16">
              <Spinner className="size-6" />
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : data.length === 0 ? (
            <EmptyState onCreate={() => setWizardOpen(true)} />
          ) : (
            <div className="wf-enter-stagger grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onOpen={() => navigate(`/trips/${trip.id}`, { title: trip.title })}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateTripWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />
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
        <div className="flex w-full max-w-[520px] flex-col items-center gap-5">
          <p className="text-base font-semibold text-pretty">{t("empty.title")}</p>
          <button
            type="button"
            onClick={onCreate}
            className="wf-enter group flex w-full items-center gap-3 rounded-xl bg-card/85 px-3.5 py-3 text-left shadow-[var(--shadow-border)] backdrop-blur-md transition-[background-color,color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-accent hover:shadow-[var(--shadow-border-hover)] active:scale-[var(--press-scale)]"
          >
            <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-accent text-corn-600 transition-[background-color] group-hover:bg-brand-muted">
              <PlusIcon className="size-5" aria-hidden="true" />
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
    <div className="flex flex-col gap-3 items-center py-16">
      <p className="text-sm text-pretty text-muted-foreground">{t("state.error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center justify-center px-2 text-sm text-corn-600 transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:underline active:scale-[var(--press-scale)]"
      >
        {t("state.retry")}
      </button>
    </div>
  );
}
