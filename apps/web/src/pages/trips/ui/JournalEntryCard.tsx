import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenTextIcon } from "lucide-react";
import type { TripSummary } from "@/entities/trip";
import { TripMapThumbnail } from "@/shared/ui/map";
import type { LocalJournalEntry } from "../model/local-journal";

interface JournalEntryCardProps {
  entry: LocalJournalEntry;
  trip: TripSummary | undefined;
  locale: string;
  onOpen?: () => void;
}

function firstMarkdownImage(markdown: string): string | undefined {
  return /!\[[^\]]*\]\((?:<)?([^\s)>]+)(?:>)?(?:\s+"[^"]*")?\)/.exec(
    markdown,
  )?.[1];
}

export function JournalEntryCard({
  entry,
  trip,
  locale,
  onOpen,
}: JournalEntryCardProps) {
  const { t } = useTranslation("trips");
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = firstMarkdownImage(entry.body) ?? trip?.coverUrl ?? undefined;
  const showCover = Boolean(coverUrl) && !coverFailed;
  const showMap = !showCover && Boolean(trip?.location);
  const category = trip?.title ?? t("journal.card.unlinked");
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(entry.publishedAt ?? entry.occurredAt));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="wf-enter wf-interactive group flex min-w-0 w-full flex-col gap-3 text-left transition-[scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.96]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-secondary shadow-[var(--shadow-border)] outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
        {showCover ? (
          <img
            src={coverUrl}
            alt={t("journal.card.coverAlt", {
              title: entry.title || t("journal.untitled"),
            })}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
          />
        ) : showMap && trip?.location ? (
          <TripMapThumbnail
            lat={trip.location.lat}
            lng={trip.location.lng}
            markerColor={trip.coverColor}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,var(--brand-muted),transparent_38%),linear-gradient(145deg,var(--secondary),var(--card))]">
            <BookOpenTextIcon
              className="absolute bottom-5 right-5 size-12 text-foreground/10"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          </div>
        )}

        <span className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-card/94 px-3 py-1.5 text-xs font-semibold text-card-foreground shadow-sm backdrop-blur-md">
          {category}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 px-0.5">
        <h2 className="line-clamp-2 font-heading text-base font-semibold leading-snug tracking-[-0.015em] text-balance transition-colors duration-[var(--dur-fast)] group-hover:text-corn-600 sm:text-lg">
          {entry.title || t("journal.untitled")}
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <time className="tabular-nums">{date}</time>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={
                entry.status === "published"
                  ? "size-1.5 rounded-full bg-success"
                  : "size-1.5 rounded-full bg-muted-foreground/55"
              }
              aria-hidden="true"
            />
            {t(`journal.status.${entry.status}`)}
          </span>
        </div>
      </div>
    </button>
  );
}
