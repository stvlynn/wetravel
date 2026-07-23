import { useTranslation } from "react-i18next";
import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  MapIcon,
  MapPinIcon,
  PenLineIcon,
} from "lucide-react";
import type { TripSummary } from "@/entities/trip";
import { cn } from "@/shared/lib";
import type { LocalJournalEntry } from "../model/local-journal";

export type HomeSurface = "today" | "trips" | "journal";

const NAV_ITEMS = [
  { id: "trips", href: "/", icon: MapIcon },
  { id: "today", href: "/today", icon: CalendarDaysIcon },
  { id: "journal", href: "/journal", icon: BookOpenTextIcon },
] as const;

interface HomeNavigationProps {
  surface: HomeSurface;
  onNavigate: (href: string) => void;
}

interface HomeSidebarProps extends HomeNavigationProps {
  recentTrips: TripSummary[];
  recentEntries: LocalJournalEntry[];
  onRecord: () => void;
  onOpenEntry: (entryId: string) => void;
}

export function HomeSidebar({
  surface,
  recentTrips,
  recentEntries,
  onNavigate,
  onRecord,
  onOpenEntry,
}: HomeSidebarProps) {
  const { t } = useTranslation("trips");

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <nav className="flex flex-col gap-1 pt-3" aria-label={t("home.nav.label")}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === surface;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.href)}
              className={cn(
                "wf-interactive wf-pressable flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium",
                active
                  ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              <span>{t(`home.nav.${item.id}`)}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onRecord}
        className="wf-interactive wf-pressable mt-4 flex min-h-11 items-center gap-3 rounded-xl bg-foreground px-3.5 text-left text-background shadow-sm hover:bg-foreground/90"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-background/12">
          <PenLineIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold">{t("home.record")}</span>
      </button>

      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        {recentTrips.length > 0 ? (
          <section>
          <p className="px-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t("home.recentTrips")}
          </p>
          <div className="mt-2 flex flex-col gap-0.5">
            {recentTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => onNavigate(`/trips/${trip.id}`)}
                className="wf-interactive wf-pressable flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MapPinIcon
                  className="size-4 flex-none text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{trip.title}</span>
              </button>
            ))}
          </div>
          </section>
        ) : null}

        {recentEntries.length > 0 ? (
          <section className="mt-7">
            <p className="px-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {t("home.recentJournal")}
            </p>
            <div className="mt-2 flex flex-col gap-0.5">
              {recentEntries.slice(0, 4).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenEntry(entry.id)}
                  className="wf-interactive wf-pressable flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left hover:bg-accent"
                >
                  <BookOpenTextIcon
                    className="size-4 flex-none text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground/85">
                      {entry.title || t("journal.untitled")}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {t(`journal.status.${entry.status}`)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function MobileHomeNav({
  surface,
  onNavigate,
}: HomeNavigationProps) {
  const { t } = useTranslation("trips");

  return (
    <nav
      aria-label={t("home.nav.label")}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-card/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === surface;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.href)}
            className={cn(
              "wf-interactive flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
              active ? "text-corn-600" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.25 : 1.8} />
            <span>{t(`home.nav.${item.id}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}
