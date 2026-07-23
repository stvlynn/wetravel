import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/app/router";
import { useIsMiniappEmbedded } from "@/app/embedded-environment";
import { useSession } from "@/shared/auth";
import { fetchTrips } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { useDocumentTitle } from "@/shared/lib";
import { AppSidebar } from "@/widgets/app-sidebar";
import { UserMenu } from "@/widgets/user-menu";
import { toastManager } from "@/shared/ui/toast";
import type { LocalJournalEntry } from "./model/local-journal";
import { useLocalJournal } from "./model/use-local-journal";
import { CreateTripWizardDialog } from "./ui/CreateTripWizardDialog";
import {
  HomeSidebar,
  MobileHomeNav,
  type HomeSurface,
} from "./ui/HomeSidebar";
import {
  JournalCollection,
  TodayView,
  TripsCollection,
} from "./ui/HomeViews";
import { JournalComposerDialog } from "./ui/JournalComposerDialog";
import { JournalDetail } from "./ui/JournalDetail";

function surfaceForPath(path: string): HomeSurface {
  if (path === "/today") return "today";
  if (path === "/journal" || path.startsWith("/journal/")) return "journal";
  return "trips";
}

export function TripsPage() {
  const { t } = useTranslation("trips");
  const { t: tc, i18n } = useTranslation("common");
  const { path, navigate } = useRouter();
  const { data: session } = useSession();
  const embedded = useIsMiniappEmbedded();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LocalJournalEntry | null>(
    null,
  );
  const [composerTripId, setComposerTripId] = useState<string | undefined>();
  const [composerInitialTitle, setComposerInitialTitle] = useState<
    string | undefined
  >();
  const surface = surfaceForPath(path);

  // Labels the native navigation bar inside the Mini Program WebView.
  useDocumentTitle(embedded ? tc("appName") : undefined);

  const {
    data: trips = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.trips,
    queryFn: fetchTrips,
  });
  const { entries, addEntry, updateEntry, deleteEntry } = useLocalJournal(
    session?.user.id,
  );
  const journalEntryId = /^\/journal\/([^/]+)$/.exec(path)?.[1];
  const journalEntry = entries.find(
    (entry) => entry.id === journalEntryId,
  );
  const currentTrip =
    trips.find((trip) => trip.status === "active") ??
    trips.find((trip) => trip.status === "planning");

  useEffect(() => {
    if (surface !== "journal") return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("compose") !== "stop") return;

    setEditingEntry(null);
    setComposerTripId(search.get("tripId") ?? undefined);
    setComposerInitialTitle(search.get("title") ?? undefined);
    setComposerOpen(true);
    window.history.replaceState(null, "", "/journal");
  }, [surface]);

  function openTrip(tripId: string) {
    navigate(`/trips/${tripId}`);
  }

  function saveJournalEntry(
    input: Parameters<typeof addEntry>[0],
  ): ReturnType<typeof addEntry> {
    const entry = addEntry(input);
    toastManager.add({
      title: t(
        input.status === "published"
          ? "journal.published"
          : "journal.savedDraft",
      ),
      type: "success",
    });
    return entry;
  }

  function editJournalEntry(entry: LocalJournalEntry) {
    setEditingEntry(entry);
    setComposerOpen(true);
  }

  function closeComposer(open: boolean) {
    setComposerOpen(open);
    if (!open) {
      setEditingEntry(null);
      setComposerTripId(undefined);
      setComposerInitialTitle(undefined);
    }
  }

  return (
    <div className="flex h-dvh bg-sidebar">
      <AppSidebar className="max-md:hidden">
        <HomeSidebar
          surface={surface}
          recentTrips={trips.slice(0, 4)}
          recentEntries={entries}
          onNavigate={navigate}
          onRecord={() => setComposerOpen(true)}
          onOpenEntry={(entryId) => navigate(`/journal/${entryId}`)}
        />
      </AppSidebar>

      <main className="min-w-0 flex-1 overflow-y-auto rounded-l-2xl border border-r-0 border-border bg-background shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25)] max-md:rounded-none max-md:border-0 max-md:shadow-none">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border/70 bg-background/88 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl md:hidden">
          {/* The native navigation bar already shows the brand when embedded. */}
          {embedded ? (
            <span aria-hidden="true" />
          ) : (
            <span className="font-heading text-lg font-semibold">
              {tc("appName")}
            </span>
          )}
          <UserMenu compact direction="down" />
        </div>

        {journalEntry ? (
          <JournalDetail
            entry={journalEntry}
            trip={trips.find((trip) => trip.id === journalEntry.tripId)}
            locale={i18n.resolvedLanguage ?? i18n.language}
            authorName={
              session?.user.name?.trim() || session?.user.email || tc("appName")
            }
            onBack={() => navigate("/journal")}
            onEdit={() => editJournalEntry(journalEntry)}
            onDelete={() => {
              deleteEntry(journalEntry.id);
              navigate("/journal");
              toastManager.add({
                title: t("journal.deleted"),
                type: "success",
              });
            }}
          />
        ) : surface === "today" ? (
          <TodayView
            trips={trips}
            entries={entries}
            locale={i18n.resolvedLanguage ?? i18n.language}
            userId={session?.user.id}
            isPending={isPending}
            isError={isError}
            onRetry={() => void refetch()}
            onOpenTrip={openTrip}
            onCreateTrip={() => setWizardOpen(true)}
            onRecord={() => setComposerOpen(true)}
            onOpenEntry={(entryId) => navigate(`/journal/${entryId}`)}
          />
        ) : surface === "journal" ? (
          <JournalCollection
            entries={entries}
            trips={trips}
            locale={i18n.resolvedLanguage ?? i18n.language}
            onRecord={() => setComposerOpen(true)}
            onOpenEntry={(entryId) => navigate(`/journal/${entryId}`)}
          />
        ) : (
          <TripsCollection
            trips={trips}
            isPending={isPending}
            isError={isError}
            onRetry={() => void refetch()}
            onOpenTrip={openTrip}
            onCreateTrip={() => setWizardOpen(true)}
          />
        )}
      </main>

      <MobileHomeNav surface={surface} onNavigate={navigate} />

      <CreateTripWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
      <JournalComposerDialog
        open={composerOpen}
        onOpenChange={closeComposer}
        trips={trips}
        preferredTripId={composerTripId ?? currentTrip?.id}
        initialTitle={composerInitialTitle}
        entry={editingEntry}
        onSave={saveJournalEntry}
        onUpdate={(input) => {
          updateEntry(input);
          toastManager.add({
            title: t(
              input.status === "published"
                ? "journal.published"
                : "journal.savedDraft",
            ),
            type: "success",
          });
        }}
      />
    </div>
  );
}
