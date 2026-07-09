import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTrip,
  renameTrip,
  reversePlace,
  fetchPreferences,
  updatePreferences,
  updateAgentPanelPreference,
  fetchAgentStatus,
  approveAgentSuggestion,
  ApiError,
  type AgentSuggestion,
} from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { stopNumbers } from "@/entities/trip";
import type { Trip } from "@/entities/trip";
import { useRouter } from "@/app/router";
import { useSession } from "@/shared/auth";
import { cn } from "@/shared/lib";
import { AppSidebar } from "@/widgets/app-sidebar";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs } from "@/shared/ui/tabs";
import { Splitter, clamp } from "@/shared/ui/splitter";
import { toastManager } from "@/shared/ui/toast";
import { useTripActions } from "./model/useTripActions";
import { useAgentEvents } from "./model/useAgentEvents";
import { Sidebar } from "./ui/Sidebar";
import { AgentToggle } from "./ui/agent/AgentToggle";
import { AgentDrawer } from "./ui/agent/AgentDrawer";
import { AgentInterventionToasts } from "./ui/agent/AgentInterventionToast";
import { NoteEditorPane } from "./ui/NoteEditorPane";
import { TripMapView } from "./ui/TripMapView";
import { ScheduleBoard, type ComposeDraft } from "./ui/ScheduleBoard";
import { BudgetBoard } from "./ui/BudgetBoard";
import { FloatingMembers } from "./ui/FloatingMembers";

type Tab = "map" | "schedule" | "budget";

const MIN_SIDEBAR_WIDTH = 0;
const MAX_SIDEBAR_WIDTH = 55;
const DEFAULT_SIDEBAR_WIDTH = 30;
const SIDEBAR_STEP = 1;

export function TravelPlannerPage({ tripId }: { tripId: string }) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const { t: ta } = useTranslation("agent");
  const { navigate } = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "lynn";
  const preferredCurrency = session?.user?.defaultCurrency;

  const { i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("map");
  const [day, setDay] = useState(0);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [noteEditingStopId, setNoteEditingStopId] = useState<string | null>(
    null,
  );
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [picking, setPicking] = useState(false);

  const queryClient = useQueryClient();
  const { data: trip, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => fetchTrip(tripId),
  });
  const actions = useTripActions(tripId);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const previousSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const sidebarCollapsed = sidebarWidth <= MIN_SIDEBAR_WIDTH;

  const { data: preferences } = useQuery({
    queryKey: queryKeys.preferences,
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.preferences, data);
    },
  });

  useEffect(() => {
    if (!preferences) return;
    const width = clamp(
      preferences.plannerSidebar?.width ?? DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    );
    setSidebarWidth(width);
    if (width > MIN_SIDEBAR_WIDTH) {
      previousSidebarWidthRef.current = width;
    }
  }, [preferences]);

  useEffect(() => {
    if (sidebarWidth > MIN_SIDEBAR_WIDTH) {
      previousSidebarWidthRef.current = sidebarWidth;
    }
  }, [sidebarWidth]);

  const handleSidebarChange = useCallback((value: number) => {
    setSidebarWidth(value);
  }, []);

  const persistSidebar = useCallback(
    (value: number) => {
      updatePreferencesMutation.mutate({
        plannerSidebarWidth: value,
        plannerSidebarCollapsed: value <= MIN_SIDEBAR_WIDTH,
      });
    },
    [updatePreferencesMutation],
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarWidth((current) => {
      let next: number;
      if (current <= MIN_SIDEBAR_WIDTH) {
        next = Math.min(
          Math.max(previousSidebarWidthRef.current, MIN_SIDEBAR_WIDTH + SIDEBAR_STEP),
          MAX_SIDEBAR_WIDTH,
        );
      } else {
        previousSidebarWidthRef.current = current;
        next = MIN_SIDEBAR_WIDTH;
      }
      persistSidebar(next);
      return next;
    });
  }, [persistSidebar]);

  // ----- Trip agent (only active when the deployment has AI configured) -----
  const { data: agentStatus } = useQuery({
    queryKey: queryKeys.agentStatus,
    queryFn: fetchAgentStatus,
    staleTime: Infinity,
  });
  const agentEnabled = agentStatus?.enabled ?? false;

  const [agentCollapsed, setAgentCollapsed] = useState(true);
  useEffect(() => {
    if (preferences) setAgentCollapsed(preferences.agentPanelCollapsed);
  }, [preferences]);

  const agentPanelMutation = useMutation({
    mutationFn: updateAgentPanelPreference,
    onSuccess: (data) => queryClient.setQueryData(queryKeys.preferences, data),
  });
  const setAgentPanel = useCallback(
    (collapsed: boolean) => {
      setAgentCollapsed(collapsed);
      agentPanelMutation.mutate(collapsed);
    },
    [agentPanelMutation],
  );

  const { suggestions: agentSuggestions, newMessages } = useAgentEvents(
    tripId,
    agentEnabled,
  );
  const pendingSuggestions = useMemo(
    () => agentSuggestions.filter((s) => s.status === "pending"),
    [agentSuggestions],
  );

  // Retire toasts and refresh the trip when someone else applies a suggestion.
  const seenPendingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of agentSuggestions) {
      if (s.status === "pending") {
        seenPendingRef.current.add(s.id);
      } else if (seenPendingRef.current.delete(s.id) && s.status === "applied") {
        if (s.appliedBy && s.appliedBy !== currentUserId) {
          const name =
            trip?.members.find((m) => m.userId === s.appliedBy)?.name ?? "";
          toastManager.add({
            title: name
              ? ta("toast.appliedByOther", { name })
              : ta("toast.applied"),
            type: "info",
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
        }
      }
    }
  }, [agentSuggestions, currentUserId, trip, ta, queryClient, tripId]);

  const seenMentionToastRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!agentEnabled) return;
    for (const message of newMessages) {
      if (message.actorUserId === currentUserId) continue;
      if (!(message.mentionedUserIds ?? []).includes(currentUserId)) continue;
      if (seenMentionToastRef.current.has(message.id)) continue;
      seenMentionToastRef.current.add(message.id);

      const preview = message.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n")
        .trim()
        .slice(0, 140);

      toastManager.add({
        title: ta("mention.toastTitle", {
          name: message.actorName ?? ta("panel.systemName"),
        }),
        description: preview || undefined,
        type: "info",
        actionProps: {
          onClick: () => setAgentPanel(false),
          children: ta("mention.view"),
        },
      });
    }
  }, [newMessages, currentUserId, agentEnabled, ta, setAgentPanel]);

  /** Proactive suggestions use the same approval DTO as AI SDK tools. */
  const approveSuggestionMutation = useMutation({
    mutationFn: (input: { id: string; approved: boolean }) =>
      approveAgentSuggestion(tripId, input),
    onSuccess: (result, variables) => {
      if (variables.approved && result && "id" in result) {
        queryClient.setQueryData(queryKeys.trip(tripId), result);
        toastManager.add({ title: ta("toast.applied"), type: "success" });
      }
    },
    onError: (err) => {
      const stale =
        err instanceof ApiError &&
        (err.status === 409 || err.code === "suggestion_stale");
      toastManager.add({
        title: stale ? ta("toast.stale") : ta("toast.applyError"),
        type: "error",
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentEvents(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentMessages(tripId) });
    },
  });

  const handleApproveSuggestion = useCallback(
    (s: AgentSuggestion) =>
      approveSuggestionMutation.mutate({ id: s.id, approved: true }),
    [approveSuggestionMutation],
  );
  const handleDenySuggestion = useCallback(
    (s: AgentSuggestion) =>
      approveSuggestionMutation.mutate({ id: s.id, approved: false }),
    [approveSuggestionMutation],
  );
  const handleDiscussSuggestion = useCallback(
    () => setAgentPanel(false),
    [setAgentPanel],
  );
  const applyingSuggestionId =
    approveSuggestionMutation.isPending &&
    approveSuggestionMutation.variables?.approved
      ? approveSuggestionMutation.variables.id
      : null;

  const rename = useMutation({
    mutationFn: (title: string) => renameTrip(tripId, title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });

  const numbers = useMemo(
    () => (trip ? stopNumbers(trip.stops) : new Map<string, number>()),
    [trip],
  );

  // Bias place search toward the trip's existing footprint for local relevance.
  const bias = useMemo(() => {
    const first = trip?.stops?.[0];
    return first ? { lat: first.lat, lng: first.lng } : undefined;
  }, [trip]);

  const openCompose = (d: number, index: number) =>
    setCompose({
      day: d,
      index,
      name: "",
      time: "",
      costCurrency: preferredCurrency || trip?.currency,
    });
  const patchCompose = (patch: Partial<ComposeDraft>) =>
    setCompose((c) => (c ? { ...c, ...patch } : c));
  const cancelCompose = () => {
    setCompose(null);
    setPicking(false);
  };
  const confirmCompose = () => {
    setCompose((c) => {
      const name = c?.name.trim();
      if (c && name) {
        actions.stop.mutate({
          day: c.day,
          index: c.index,
          name,
          time: c.time.trim(),
          duration: c.duration?.trim() || undefined,
          lat: c.lat,
          lng: c.lng,
          area: c.area,
          category: c.category,
          cost: c.cost,
          costCurrency: c.costCurrency,
          note: c.note?.trim() || undefined,
        });
      }
      return null;
    });
    setPicking(false);
  };
  const startPickOnMap = () => {
    if (!compose) return;
    setPicking(true);
    setTab("map");
  };
  const handleMapPick = async (lng: number, lat: number) => {
    setPicking(false);
    setTab("schedule");
    let name: string | undefined;
    let area: string | undefined;
    try {
      const place = await reversePlace(lat, lng, i18n.resolvedLanguage ?? "en");
      if (place) {
        name = place.label;
        area = place.secondary || undefined;
      }
    } catch {
      // Reverse geocoding is best-effort; keep any name the user already typed.
    }
    setCompose((c) =>
      c ? { ...c, lat, lng, name: c.name.trim() || name || c.name, area } : c,
    );
  };
  // Right-click "Add a stop here": open the composer pre-filled at the clicked point.
  const addStopAt = async (lng: number, lat: number) => {
    if (!trip) return;
    const targetDay = day > 0 ? day : (trip.days[0]?.number ?? 1);
    const index = trip.stops.filter((s) => s.day === targetDay).length;
    setCompose({
      day: targetDay,
      index,
      name: "",
      time: "",
      lat,
      lng,
      costCurrency: preferredCurrency || trip.currency,
    });
    setPicking(false);
    setTab("schedule");
    try {
      const place = await reversePlace(lat, lng, i18n.resolvedLanguage ?? "en");
      if (place) {
        setCompose((c) =>
          c
            ? {
                ...c,
                name: c.name.trim() || place.label,
                area: place.secondary || undefined,
              }
            : c,
        );
      }
    } catch {
      // Reverse geocoding is best-effort; the user can still type a name.
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className="flex h-dvh bg-sidebar">
        <AppSidebar top={<BackButton onBack={() => navigate("/")} />} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-l-2xl border border-r-0 border-border bg-background">
          <p className="text-sm text-pretty text-muted-foreground">{tc("state.error")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-10 items-center justify-center px-2 text-sm text-corn-600 transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:underline active:scale-[var(--press-scale)]"
          >
            {tc("state.retry")}
          </button>
        </div>
      </div>
    );
  }

  const tabItems = [
    { value: "map", label: t("tabs.map") },
    { value: "schedule", label: t("tabs.schedule") },
    { value: "budget", label: t("tabs.budget") },
  ];

  const selectStop = (id: string) => {
    setSelectedStopId(id);
    setNoteEditingStopId((current) => (current && current !== id ? null : current));
  };

  const noteEditingStop = noteEditingStopId
    ? trip.stops.find((s) => s.id === noteEditingStopId)
    : undefined;

  useEffect(() => {
    if (noteEditingStopId && !trip.stops.some((s) => s.id === noteEditingStopId)) {
      setNoteEditingStopId(null);
    }
  }, [noteEditingStopId, trip.stops]);

  const openNoteEditor = (stopId: string) => {
    setSelectedStopId(stopId);
    setNoteEditingStopId(stopId);
  };

  const closeNoteEditor = () => {
    setNoteEditingStopId(null);
  };

  const headerSubtitle = formatTripSubtitle(trip, i18n.language, t);
  const agentPanelOpen = agentEnabled && !agentCollapsed;

  return (
    <div className="flex h-dvh bg-sidebar">
      <Splitter
        orientation="horizontal"
        value={sidebarWidth}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
        step={SIDEBAR_STEP}
        primaryPaneId="planner-sidebar"
        aria-label={t("splitter.sidebarLabel")}
        onChange={handleSidebarChange}
        onChangeEnd={persistSidebar}
      >
        <AppSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={toggleSidebarCollapsed}
          top={
            <div className="flex flex-col gap-2">
              <BackButton
                onBack={() => navigate("/")}
                title={trip.title}
                subtitle={headerSubtitle}
                onRename={(title) => rename.mutate(title)}
              />
              <div className="px-1 pb-1 pt-2">
                <Tabs
                  items={tabItems}
                  value={tab}
                  onValueChange={(v) => {
                    setNoteEditingStopId(null);
                    setTab(v as Tab);
                  }}
                  aria-label={t("tabs.map")}
                  className="flex w-full"
                />
              </div>
            </div>
          }
        >
          <Sidebar
            trip={trip}
            day={day}
            onDayChange={(d) => {
              setDay(d);
              setSelectedStopId(null);
              setNoteEditingStopId(null);
            }}
            selectedStopId={selectedStopId}
            onSelectStop={selectStop}
            onCloseDetail={() => setSelectedStopId(null)}
            currentUserId={currentUserId}
            canEdit={trip.permissions.canEdit}
            onToggleVote={(stopId) => actions.vote.mutate(stopId)}
            onComment={(stopId, text) =>
              actions.comment.mutate({ stopId, text })
            }
            commentPending={actions.comment.isPending}
            onUpdateStop={(stopId, patch) =>
              actions.stopUpdate.mutate({ stopId, patch })
            }
            onChangeStopDay={(stopId, targetDay) => {
              const index = trip.stops.filter((s) => s.day === targetDay).length;
              actions.stopMove.mutate({ stopId, day: targetDay, index });
            }}
            onExpandNote={openNoteEditor}
          />
        </AppSidebar>

        <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className={cn(
            "relative z-[5] flex min-w-0 flex-1 overflow-hidden border border-border bg-background transition-[border-radius,box-shadow] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
            agentPanelOpen
              ? "rounded-2xl shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25),8px_0_24px_-16px_rgba(15,23,42,0.25)]"
              : "rounded-l-2xl border-r-0 shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25)]",
          )}
        >
          <main className="relative flex min-w-0 flex-1 flex-col">
            <div
              className={cn(
                "relative min-h-0 flex-1",
                noteEditingStop ? "overflow-hidden" : "overflow-auto",
              )}
            >
              {noteEditingStop ? (
                <NoteEditorPane
                  tripId={trip.id}
                  editorKey={noteEditingStop.id}
                  value={noteEditingStop.note}
                  placeholder={t("detail.notePlaceholder")}
                  onCommit={(note) =>
                    actions.stopUpdate.mutate({
                      stopId: noteEditingStop.id,
                      patch: { note },
                    })
                  }
                  onClose={closeNoteEditor}
                />
              ) : tab === "map" ? (
              <TripMapView
                trip={trip}
                numbers={numbers}
                day={day}
                activeStopId={selectedStopId}
                onSelectStop={selectStop}
                picking={picking}
                onPick={handleMapPick}
                onAddStopHere={addStopAt}
                onCancelPick={() => {
                  setPicking(false);
                  setTab("schedule");
                }}
              />
            ) : tab === "schedule" ? (
              <ScheduleBoard
                trip={trip}
                compose={compose}
                defaultCurrency={preferredCurrency || trip.currency}
                biasLat={bias?.lat}
                biasLng={bias?.lng}
                onOpen={openCompose}
                onChange={patchCompose}
                onConfirm={confirmCompose}
                onCancel={cancelCompose}
                onPickOnMap={startPickOnMap}
                onSelectStop={(id) => {
                  setTab("map");
                  setDay(0);
                  selectStop(id);
                }}
                onAddDay={() => actions.day.mutate()}
                onUpdateDay={(dayNumber, patch) =>
                  actions.dayUpdate.mutate({ dayNumber, patch })
                }
                onDeleteDay={(dayNumber) => actions.dayDelete.mutate(dayNumber)}
                onReorderDays={(order) => actions.dayReorder.mutate(order)}
                onMoveStop={(input) => actions.stopMove.mutate(input)}
                addingDay={actions.day.isPending}
                deletingDayNumber={
                  actions.dayDelete.isPending
                    ? actions.dayDelete.variables
                    : undefined
                }
                updatingDayNumber={
                  actions.dayUpdate.isPending
                    ? actions.dayUpdate.variables?.dayNumber
                    : undefined
                }
              />
            ) : (
              <BudgetBoard
                trip={trip}
                currentUserId={currentUserId}
                defaultCurrency={preferredCurrency || trip.currency}
                canEdit={trip.permissions.canEdit}
                onAddExpense={(input) => actions.expense.mutate(input)}
                onUpdateExpense={(expenseId, input) =>
                  actions.expenseUpdate.mutate({ expenseId, input })
                }
              />
            )}
          </div>

          {noteEditingStop ? null : (
            <FloatingMembers
              tripId={trip.id}
              members={trip.members}
              canInvite={trip.permissions.canInvite}
            />
          )}
      </main>
      </div>

          {agentEnabled ? (
            <AgentDrawer
              open={!agentCollapsed}
              tripId={trip.id}
              trip={trip}
              canEdit={trip.permissions.canEdit}
              applyingId={applyingSuggestionId}
              onApproveSuggestion={handleApproveSuggestion}
              onDenySuggestion={handleDenySuggestion}
              onClose={() => setAgentPanel(true)}
            />
          ) : null}
        </div>
      </Splitter>

      {agentEnabled && agentCollapsed ? (
        <AgentToggle
          onOpen={() => setAgentPanel(false)}
          reserveMapControls={tab === "map" && !noteEditingStop}
        />
      ) : null}

      {agentEnabled ? (
        <AgentInterventionToasts
          suggestions={pendingSuggestions}
          canEdit={trip.permissions.canEdit}
          applyingId={applyingSuggestionId}
          onApprove={handleApproveSuggestion}
          onDiscuss={handleDiscussSuggestion}
          onDeny={handleDenySuggestion}
        />
      ) : null}
    </div>
  );
}

function BackButton({
  onBack,
  title,
  subtitle,
  onRename,
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  onRename?: (title: string) => void;
}) {
  const { t } = useTranslation("common");
  const { t: tp } = useTranslation("planner");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");

  useEffect(() => setValue(title ?? ""), [title]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== title) onRename?.(next);
    else setValue(title ?? "");
  };

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("actions.back")}
        title={t("actions.back")}
        className="relative inline-flex size-8 flex-none items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] after:absolute after:-inset-1 after:content-[''] hover:bg-accent hover:text-foreground active:scale-[var(--press-scale)]"
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
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      {title == null ? null : editing ? (
        <input
          autoFocus
          value={value}
          maxLength={120}
          aria-label={tp("header.renameAria")}
          placeholder={tp("header.renamePlaceholder")}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setValue(title);
              setEditing(false);
            }
          }}
          className="min-h-8 w-full rounded-md border border-ring bg-background px-1.5 py-1 font-heading text-base font-semibold outline-none"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            title={onRename ? tp("header.renameAria") : title}
            className="truncate text-left font-heading text-base font-semibold leading-tight tracking-tight transition-[color,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-corn-600 active:scale-[var(--press-scale)]"
          >
            {title}
          </button>
          {subtitle ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
              {subtitle}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatTripSubtitle(
  trip: Trip,
  locale: string,
  t: TFunction<"planner">,
): string {
  const dayCount = trip.days.length;
  const stopCount = trip.stops.length;

  let startLabel = "";
  let endLabel = "";

  if (ISO_DATE.test(trip.startDate) && dayCount > 0) {
    const [y, m, d] = trip.startDate.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + dayCount - 1));
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const fmt = (date: Date, withYear: boolean) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: withYear ? "numeric" : undefined,
        timeZone: "UTC",
      }).format(date);
    startLabel = fmt(start, !sameYear);
    endLabel = fmt(end, true);
  }

  return t("header.subtitle", {
    start: startLabel,
    end: endLabel,
    days: dayCount,
    stops: stopCount,
  });
}
