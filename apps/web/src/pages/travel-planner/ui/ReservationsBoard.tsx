import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  CalendarCheck2,
  Car,
  CircleEllipsis,
  MapPin,
  Plane,
  Plus,
  Ticket,
  TrainFront,
  Utensils,
} from "lucide-react";
import type {
  Reservation,
  ReservationDraft,
  ReservationStatus,
  ReservationType,
} from "@/entities/reservation";
import type { Trip } from "@/entities/trip";
import {
  ApiError,
  cancelReservation,
  createReservation,
  deleteReservation,
  fetchReservations,
  updateReservation,
} from "@/shared/api";
import { queryKeys } from "@/shared/config";
import {
  formatMoney,
  fromZonedDateTimeLocal,
  toZonedDateTimeLocal,
} from "@/shared/lib";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/shared/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";

const TYPES: ReservationType[] = [
  "flight",
  "accommodation",
  "restaurant",
  "rail",
  "ground_transport",
  "activity",
  "other",
];
const STATUSES: ReservationStatus[] = [
  "tentative",
  "confirmed",
  "completed",
  "cancelled",
];

export function ReservationsBoard({
  trip,
  canEdit,
}: {
  trip: Trip;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation("planner");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Reservation | "new" | null>(null);
  const [createKey, setCreateKey] = useState<string | null>(null);
  const query = useQuery({
    queryKey: queryKeys.reservations(trip.id),
    queryFn: () => fetchReservations(trip.id),
  });
  const reservations = query.data ?? [];
  const grouped = useMemo(() => groupReservations(reservations), [reservations]);

  function openCreate() {
    setCreateKey(crypto.randomUUID());
    setEditing("new");
  }

  const save = useMutation({
    mutationFn: async (input: ReservationDraft) => {
      if (editing === "new") {
        if (!createKey) {
          throw new Error("Missing create idempotency key");
        }
        return createReservation(trip.id, input, createKey);
      }
      return updateReservation(trip.id, editing!, input);
    },
    onSuccess: (reservation) => {
      queryClient.setQueryData<Reservation[]>(
        queryKeys.reservations(trip.id),
        (previous = []) => upsert(previous, reservation),
      );
      setCreateKey(null);
      setEditing(null);
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === "reservation_conflict" &&
        isReservation(error.current)
      ) {
        const current = error.current as Reservation;
        queryClient.setQueryData<Reservation[]>(
          queryKeys.reservations(trip.id),
          (previous = []) => upsert(previous, current),
        );
        setEditing(current);
      }
    },
  });

  const cancel = useMutation({
    mutationFn: (reservation: Reservation) =>
      cancelReservation(trip.id, reservation),
    onSuccess: (reservation) => {
      queryClient.setQueryData<Reservation[]>(
        queryKeys.reservations(trip.id),
        (previous = []) => upsert(previous, reservation),
      );
      setEditing(reservation);
    },
  });

  const remove = useMutation({
    mutationFn: (reservation: Reservation) =>
      deleteReservation(trip.id, reservation),
    onSuccess: (_result, reservation) => {
      queryClient.setQueryData<Reservation[]>(
        queryKeys.reservations(trip.id),
        (previous = []) => previous.filter((item) => item.id !== reservation.id),
      );
      setEditing(null);
    },
  });

  if (query.isPending) {
    return (
      <div className="flex min-h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {t("reservations.loading")}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground text-pretty">
          {t("reservations.loadError")}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("reservations.retry")}
        </Button>
      </div>
    );
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 p-4 pb-24 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground text-balance">
            {t("reservations.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {t("reservations.subtitle")}
          </p>
        </div>
        {canEdit ? (
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            {t("reservations.add")}
          </Button>
        ) : null}
      </header>

      {reservations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-border)]">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-muted text-corn-600">
            <CalendarCheck2 className="size-6" aria-hidden="true" />
          </div>
          <h2 className="font-medium text-foreground">
            {t("reservations.empty")}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
            {t("reservations.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {[...grouped.entries()].map(([day, entries]) => (
            <section key={day ?? "unscheduled"} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {day == null
                  ? t("reservations.unscheduled")
                  : t("reservations.day", { day })}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {entries.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    locale={i18n.language}
                    onClick={() => setEditing(reservation)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ReservationEditor
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        reservation={editing === "new" ? null : editing}
        trip={trip}
        canEdit={canEdit}
        pending={save.isPending || cancel.isPending || remove.isPending}
        error={save.error}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(input) => save.mutate(input)}
        onCancel={editing && editing !== "new" ? () => cancel.mutate(editing) : undefined}
        onDelete={editing && editing !== "new" ? () => remove.mutate(editing) : undefined}
      />
    </section>
  );
}

function ReservationCard({
  reservation,
  locale,
  onClick,
}: {
  reservation: Reservation;
  locale: string;
  onClick: () => void;
}) {
  const { t } = useTranslation("planner");
  const Icon = iconFor(reservation.type);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-24 w-full items-start gap-3 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-border)] outline-none transition-[background-color,box-shadow,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring active:scale-[var(--press-scale)]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-corn-600">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {reservation.title}
          </span>
          <Badge variant={badgeFor(reservation.status)}>
            {t(`reservations.statuses.${reservation.status}`)}
          </Badge>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {formatDateTime(reservation.startAt, locale, reservation.timezone)}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1 truncate">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {reservation.locationName || reservation.provider || "—"}
          </span>
          {reservation.amountMinor != null && reservation.currency ? (
            <span className="shrink-0 tabular-nums">
              {formatMoney(reservation.amountMinor, reservation.currency, locale)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function ReservationEditor({
  open,
  reservation,
  trip,
  canEdit,
  pending,
  error,
  onOpenChange,
  onSave,
  onCancel,
  onDelete,
}: {
  open: boolean;
  reservation: Reservation | null;
  trip: Trip;
  canEdit: boolean;
  pending: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ReservationDraft) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation("planner");
  const initialTimezone =
    reservation?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const [type, setType] = useState<ReservationType>(reservation?.type ?? "flight");
  const [status, setStatus] = useState<ReservationStatus>(reservation?.status ?? "tentative");
  const [title, setTitle] = useState(reservation?.title ?? "");
  const [provider, setProvider] = useState(reservation?.provider ?? "");
  const [confirmation, setConfirmation] = useState(reservation?.confirmationNumber ?? "");
  const [timezone, setTimezone] = useState(initialTimezone);
  const [startAt, setStartAt] = useState(
    toZonedDateTimeLocal(reservation?.startAt, initialTimezone),
  );
  const [endAt, setEndAt] = useState(
    toZonedDateTimeLocal(reservation?.endAt, initialTimezone),
  );
  const [location, setLocation] = useState(reservation?.locationName ?? "");
  const [dayNumber, setDayNumber] = useState(String(reservation?.dayNumber ?? "none"));
  const [stopId, setStopId] = useState(reservation?.stopId ?? "none");
  const [amount, setAmount] = useState(
    reservation?.amountMinor == null ? "" : String(reservation.amountMinor),
  );
  const [currency, setCurrency] = useState(reservation?.currency ?? trip.currency);
  const [notes, setNotes] = useState(reservation?.notes ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !startAt) return;
    onSave({
      type,
      status,
      title,
      provider,
      confirmationNumber: confirmation,
      startAt: fromZonedDateTimeLocal(startAt, timezone),
      endAt: endAt ? fromZonedDateTimeLocal(endAt, timezone) : null,
      timezone,
      locationName: location,
      dayNumber: dayNumber === "none" ? null : Number(dayNumber),
      stopId: stopId === "none" ? null : stopId,
      amountMinor: amount === "" ? null : Number(amount),
      currency: amount === "" ? null : currency,
      notes,
    });
  }

  const conflict = error instanceof ApiError && error.code === "reservation_conflict";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-200 data-[ending-style]:opacity-0" />
        <DialogViewport className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden p-0 md:items-center md:p-6">
          <DialogPopup className="flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 md:max-w-2xl md:rounded-2xl">
            <DialogHeader className="pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-6">
              <DialogTitle className="text-lg font-semibold text-foreground text-balance">
                {reservation ? t("reservations.edit") : t("reservations.add")}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground text-pretty">
                {t("reservations.subtitle")}
              </DialogDescription>
            </DialogHeader>
            <form className="contents" onSubmit={submit}>
              <DialogPanel className="grid grid-cols-1 gap-4 py-3 md:grid-cols-2">
                <SelectField label={t("reservations.labels.type")} value={type} values={TYPES} onChange={(value) => setType(value as ReservationType)} translation="types" />
                <SelectField label={t("reservations.labels.status")} value={status} values={reservation ? availableStatuses(reservation.status) : STATUSES.slice(0, 2)} onChange={(value) => setStatus(value as ReservationStatus)} translation="statuses" disabled={reservation?.status === "cancelled"} />
                <Field className="md:col-span-2" name="title">
                  <FieldLabel>{t("reservations.labels.name")}</FieldLabel>
                  <Input required type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("reservations.placeholders.name")} disabled={!canEdit || pending} />
                </Field>
                <Field name="provider">
                  <FieldLabel>{t("reservations.labels.provider")}</FieldLabel>
                  <Input type="text" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder={t("reservations.placeholders.provider")} disabled={!canEdit || pending} />
                </Field>
                <Field name="confirmationNumber">
                  <FieldLabel>{t("reservations.labels.confirmation")}</FieldLabel>
                  <Input type="text" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={t("reservations.placeholders.confirmation")} disabled={!canEdit || pending} />
                </Field>
                <Field name="startAt">
                  <FieldLabel>{t("reservations.labels.start")}</FieldLabel>
                  <Input required type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} disabled={!canEdit || pending} />
                </Field>
                <Field name="endAt">
                  <FieldLabel>{t("reservations.labels.end")}</FieldLabel>
                  <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} disabled={!canEdit || pending} />
                </Field>
                <Field name="timezone">
                  <FieldLabel>{t("reservations.labels.timezone")}</FieldLabel>
                  <Input required type="text" value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!canEdit || pending} />
                </Field>
                <Field name="locationName">
                  <FieldLabel>{t("reservations.labels.location")}</FieldLabel>
                  <Input type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("reservations.placeholders.location")} disabled={!canEdit || pending} />
                </Field>
                <Field name="dayNumber">
                  <FieldLabel>{t("reservations.labels.day")}</FieldLabel>
                  <Select items={[{ value: "none", label: t("reservations.unscheduled") }, ...trip.days.map((day) => ({ value: String(day.number), label: t("reservations.day", { day: day.number }) }))]} value={dayNumber} onValueChange={(value) => setDayNumber(String(value))} disabled={!canEdit || pending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="none">{t("reservations.unscheduled")}</SelectItem>
                      {trip.days.map((day) => <SelectItem key={day.number} value={String(day.number)}>{t("reservations.day", { day: day.number })}</SelectItem>)}
                    </SelectPopup>
                  </Select>
                </Field>
                <Field name="stopId">
                  <FieldLabel>{t("reservations.labels.stop")}</FieldLabel>
                  <Select items={[{ value: "none", label: t("reservations.placeholders.noStop") }, ...trip.stops.map((stop) => ({ value: stop.id, label: stop.name }))]} value={stopId} onValueChange={(value) => {
                    const next = String(value);
                    setStopId(next);
                    const stop = trip.stops.find((item) => item.id === next);
                    if (stop) setDayNumber(String(stop.day));
                  }} disabled={!canEdit || pending}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="none">{t("reservations.placeholders.noStop")}</SelectItem>
                      {trip.stops.map((stop) => <SelectItem key={stop.id} value={stop.id}>{stop.name}</SelectItem>)}
                    </SelectPopup>
                  </Select>
                </Field>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <Field name="amountMinor">
                    <FieldLabel>{t("reservations.labels.amount")}</FieldLabel>
                    <Input type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!canEdit || pending} className="tabular-nums" />
                  </Field>
                  <Field name="currency">
                    <FieldLabel>{t("reservations.labels.currency")}</FieldLabel>
                    <Input type="text" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} disabled={!canEdit || pending || amount === ""} />
                  </Field>
                </div>
                <Field className="md:col-span-2" name="notes">
                  <FieldLabel>{t("reservations.labels.notes")}</FieldLabel>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("reservations.placeholders.notes")} disabled={!canEdit || pending} />
                </Field>
                {error ? (
                  <FieldError className="md:col-span-2">
                    {conflict ? t("reservations.conflict") : t("reservations.saveError")}
                  </FieldError>
                ) : null}
              </DialogPanel>
              <DialogFooter className="flex-wrap pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6">
                {reservation && canEdit ? (
                  <>
                    {reservation.status !== "cancelled" ? <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t("reservations.cancel")}</Button> : null}
                    <Button type="button" variant="destructive-outline" disabled={pending} onClick={() => setDeleteOpen(true)}>{t("reservations.delete")}</Button>
                  </>
                ) : null}
                <span className="flex-1" />
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("reservations.close")}</Button>
                {canEdit && reservation?.status !== "cancelled" ? <Button type="submit" variant="brand" disabled={pending}>{pending ? t("reservations.saving") : t("reservations.save")}</Button> : null}
              </DialogFooter>
            </form>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reservations.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reservations.emptyHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>{t("reservations.close")}</AlertDialogClose>
            <AlertDialogClose render={<Button variant="destructive" onClick={onDelete} />}>{t("reservations.delete")}</AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </Dialog>
  );
}

function SelectField({ label, value, values, onChange, translation, disabled }: { label: string; value: string; values: string[]; onChange: (value: string) => void; translation: "types" | "statuses"; disabled?: boolean }) {
  const { t } = useTranslation("planner");
  const items = values.map((item) => ({
    value: item,
    label: t(`reservations.${translation}.${item}` as never) as string,
  }));
  return <Field><FieldLabel>{label}</FieldLabel><Select items={items} value={value} onValueChange={(next) => onChange(String(next))} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectPopup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectPopup></Select></Field>;
}

function groupReservations(reservations: Reservation[]) {
  const groups = new Map<number | null, Reservation[]>();
  for (const reservation of reservations) {
    const list = groups.get(reservation.dayNumber) ?? [];
    list.push(reservation);
    groups.set(reservation.dayNumber, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a == null ? 1 : b == null ? -1 : a - b));
}

function upsert(items: Reservation[], reservation: Reservation) {
  const next = items.filter((item) => item.id !== reservation.id);
  next.push(reservation);
  return next.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function isReservation(value: unknown): value is Reservation {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function iconFor(type: ReservationType) {
  return type === "flight" ? Plane : type === "accommodation" ? BedDouble : type === "restaurant" ? Utensils : type === "rail" ? TrainFront : type === "ground_transport" ? Car : type === "activity" ? Ticket : CircleEllipsis;
}

function badgeFor(status: ReservationStatus): "neutral" | "success" | "warning" {
  return status === "confirmed" || status === "completed" ? "success" : status === "tentative" ? "warning" : "neutral";
}

function availableStatuses(status: ReservationStatus): ReservationStatus[] {
  if (status === "tentative") return ["tentative", "confirmed", "cancelled"];
  if (status === "confirmed") return ["confirmed", "tentative", "completed", "cancelled"];
  return [status];
}

function formatDateTime(value: string, locale: string, timezone: string) {
  try { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); } catch { return new Date(value).toLocaleString(locale); }
}
