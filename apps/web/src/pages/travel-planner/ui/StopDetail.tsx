import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import type { Trip } from "@/entities/trip";
import {
  CategoryIcon,
  type Stop,
  type StopCategory,
  type StopComment,
} from "@/entities/stop";
import type { TripMember } from "@/entities/member";
import type { UpdateStopInput } from "@/shared/api";
import { cn, CURRENCIES, formatMoney } from "@/shared/lib";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { IconSwap } from "@/shared/ui/icon-swap";
import { Input } from "@/shared/ui/input";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/shared/ui/popover";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/shared/ui/tooltip";

const CATEGORY_OPTIONS: StopCategory[] = [
  "Sight",
  "Food",
  "Stay",
  "Shopping",
  "Activity",
  "Walk",
  "Park",
  "Transit",
  "Plan",
];

/** Half-hourly time options, matching the schedule composer's picker. */
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, "0");
  const mm = i % 2 ? "30" : "00";
  return `${hh}:${mm}`;
});

const DURATION_OPTIONS = [
  "0.5h",
  "1h",
  "1.5h",
  "2h",
  "2.5h",
  "3h",
  "4h",
  "5h",
  "6h",
  "8h",
];

/** Keep a data value selectable even when it is not one of the presets. */
function withCurrent(options: readonly string[], current: string): string[] {
  return current && !options.includes(current)
    ? [current, ...options]
    : [...options];
}

function memberOf(trip: Trip, id: string): TripMember {
  return trip.members.find((m) => m.id === id) ?? trip.members[0]!;
}

function commentKey(c: StopComment): string {
  return `${c.author}|${c.timeLabel}|${c.text}`;
}

function VoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function UnvoteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function VoteToggleIcon({ voted }: { voted: boolean }) {
  return (
    <IconSwap
      className="size-4"
      active={voted}
      from={<VoteIcon className="size-4" />}
      to={<UnvoteIcon className="size-4" />}
    />
  );
}

/** Small caret hinting that a meta chip opens an editor. */
function EditCaret() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="-mr-0.5 size-3 opacity-60"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type MetaTone = "secondary" | "outline" | "info";

const META_TONES: Record<MetaTone, string> = {
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  outline: "border border-border bg-card text-foreground hover:bg-accent",
  info: "bg-brand-muted text-corn-600 hover:bg-brand-muted/70",
};

/** Badge-shaped trigger used for the inline meta editors. */
function metaTriggerClass(tone: MetaTone, extra?: string): string {
  return cn(
    "relative inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums",
    "transition-[background-color,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "after:absolute after:-inset-1 after:content-[''] active:scale-[var(--press-scale)]",
    "data-[popup-open]:ring-1 data-[popup-open]:ring-ring",
    META_TONES[tone],
    extra,
  );
}

/** Text that turns into an input on click, committing on blur/Enter. Falls back
 * to static text when the user cannot edit. */
function InlineText({
  value,
  onCommit,
  canEdit,
  ariaLabel,
  placeholder,
  displayClassName,
  inputClassName,
  display,
}: {
  value: string;
  onCommit: (next: string) => void;
  canEdit: boolean;
  ariaLabel: string;
  placeholder?: string;
  displayClassName: string;
  inputClassName: string;
  display?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (!canEdit) {
    return <span className={displayClassName}>{display ?? value}</span>;
  }

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={inputClassName}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={ariaLabel}
      className={cn(
        "text-left transition-[color,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-corn-600 active:scale-[var(--press-scale)]",
        displayClassName,
      )}
    >
      {display ?? value}
    </button>
  );
}

/** Popover editor for a stop's day, start time, and duration. */
function ScheduleEditor({
  trip,
  stop,
  label,
  onUpdateStop,
  onChangeStopDay,
}: {
  trip: Trip;
  stop: Stop;
  label: string;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
  onChangeStopDay: (stopId: string, day: number) => void;
}) {
  const { t } = useTranslation("planner");
  const timeItems = withCurrent(TIME_OPTIONS, stop.time);
  const durationItems = withCurrent(DURATION_OPTIONS, stop.duration);

  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" className={metaTriggerClass("secondary")} />}
        aria-label={t("detail.editSchedule")}
      >
        <span>{label}</span>
        <EditCaret />
      </PopoverTrigger>
      <PopoverPopup className="flex w-56 flex-col gap-3">
        <EditorField label={t("detail.dayLabel")}>
          <Select
            items={trip.days.map((d) => ({
              value: d.number,
              label: t("days.day", { n: d.number }),
            }))}
            value={stop.day}
            onValueChange={(value) => {
              const next = Number(value);
              if (Number.isFinite(next) && next !== stop.day) {
                onChangeStopDay(stop.id, next);
              }
            }}
          >
            <SelectTrigger className="rounded-lg" aria-label={t("detail.dayLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {trip.days.map((d) => (
                <SelectItem key={d.number} value={d.number}>
                  {t("days.day", { n: d.number })}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EditorField>
        <EditorField label={t("detail.timeLabel")}>
          <Select
            items={timeItems.map((v) => ({ value: v, label: v }))}
            value={stop.time || null}
            onValueChange={(value) =>
              value && onUpdateStop(stop.id, { time: String(value) })
            }
          >
            <SelectTrigger
              className="rounded-lg tabular-nums"
              aria-label={t("detail.timeLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {timeItems.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EditorField>
        <EditorField label={t("detail.durationLabel")}>
          <Select
            items={durationItems.map((v) => ({ value: v, label: v }))}
            value={stop.duration || null}
            onValueChange={(value) =>
              value && onUpdateStop(stop.id, { duration: String(value) })
            }
          >
            <SelectTrigger
              className="rounded-lg tabular-nums"
              aria-label={t("detail.durationLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {durationItems.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EditorField>
      </PopoverPopup>
    </Popover>
  );
}

/** Compact category select styled as an outline chip. */
function CategoryEditor({
  stop,
  onUpdateStop,
}: {
  stop: Stop;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
}) {
  const { t } = useTranslation("planner");
  return (
    <Select
      items={CATEGORY_OPTIONS.map((c) => ({ value: c, label: t(`category.${c}`) }))}
      value={stop.category}
      onValueChange={(value) =>
        value && onUpdateStop(stop.id, { category: value as StopCategory })
      }
    >
      <SelectTrigger
        className="h-auto w-auto gap-1 rounded-sm px-2 py-0.5 text-xs font-medium after:-inset-1"
        aria-label={t("detail.editCategory")}
      >
        <SelectValue>
          {(value: StopCategory | null) => (
            <span className="flex items-center gap-1">
              <CategoryIcon category={value ?? stop.category} />
              {t(`category.${value ?? stop.category}`)}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {CATEGORY_OPTIONS.map((c) => (
          <SelectItem key={c} value={c}>
            <span className="flex items-center gap-2">
              <CategoryIcon category={c} />
              {t(`category.${c}`)}
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

/** Popover editor for a stop's per-person cost and its currency. */
function CostEditor({
  trip,
  stop,
  label,
  onUpdateStop,
}: {
  trip: Trip;
  stop: Stop;
  label: string;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
}) {
  const { t } = useTranslation("planner");
  const currency = stop.costCurrency || trip.currency;
  const [amount, setAmount] = useState(stop.cost ? String(stop.cost) : "");

  useEffect(() => {
    setAmount(stop.cost ? String(stop.cost) : "");
  }, [stop.cost]);

  const commitAmount = () => {
    const next = amount === "" ? 0 : Math.max(0, Math.round(Number(amount)));
    if (!Number.isFinite(next) || next === stop.cost) return;
    onUpdateStop(stop.id, { cost: next, costCurrency: currency });
  };

  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" className={metaTriggerClass("info")} />}
        aria-label={t("detail.editCost")}
      >
        <span>{label}</span>
        <EditCaret />
      </PopoverTrigger>
      <PopoverPopup className="flex w-64 flex-col gap-2">
        <EditorField label={t("detail.costLabel")}>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={commitAmount}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={t("schedule.costPlaceholder")}
              className="min-w-0 flex-1 rounded-lg tabular-nums"
              aria-label={t("detail.costLabel")}
            />
            <Select
              items={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={currency}
              onValueChange={(value) => {
                const next = String(value);
                onUpdateStop(stop.id, {
                  cost: amount === "" ? 0 : Math.max(0, Math.round(Number(amount))),
                  costCurrency: next,
                });
              }}
            >
              <SelectTrigger
                className="w-[92px] flex-none rounded-lg tabular-nums"
                aria-label={t("schedule.currencyLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </EditorField>
      </PopoverPopup>
    </Popover>
  );
}

function EditorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function StopDetail({
  trip,
  stop,
  currentUserId,
  canEdit,
  onClose,
  onToggleVote,
  onComment,
  commentPending = false,
  onUpdateStop,
  onChangeStopDay,
}: {
  trip: Trip;
  stop: Stop;
  currentUserId: string;
  canEdit: boolean;
  onClose: () => void;
  onToggleVote: (stopId: string) => void;
  onComment: (stopId: string, text: string) => void;
  commentPending?: boolean;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
  onChangeStopDay: (stopId: string, day: number) => void;
}) {
  const { t } = useTranslation("planner");
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [staggerComments, setStaggerComments] = useState(false);
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(() => new Set());
  const prevCommentsRef = useRef(stop.comments);
  const voted = stop.votes.includes(currentUserId);
  const addedBy = memberOf(trip, stop.createdBy);
  const currentUser = memberOf(trip, currentUserId);
  const scheduleLabel = t("detail.dayTime", {
    day: stop.day,
    time: stop.time,
    dur: stop.duration,
  });
  const costLabel = stop.cost
    ? t("detail.perPerson", {
        amount: formatMoney(stop.cost, stop.costCurrency || trip.currency),
      })
    : t("detail.free");

  useEffect(() => {
    prevCommentsRef.current = stop.comments;
    setEnteringKeys(new Set());
    if (stop.comments.length > 0) {
      setStaggerComments(true);
      const timer = window.setTimeout(() => setStaggerComments(false), 640);
      return () => window.clearTimeout(timer);
    }
    setStaggerComments(false);
  }, [stop.id]);

  useEffect(() => {
    if (staggerComments) return;

    const prevKeys = new Set(prevCommentsRef.current.map(commentKey));
    const added = stop.comments
      .map(commentKey)
      .filter((key) => !prevKeys.has(key));
    prevCommentsRef.current = stop.comments;

    if (added.length === 0) return;

    setEnteringKeys(new Set(added));
    const timer = window.setTimeout(() => setEnteringKeys(new Set()), 400);
    return () => window.clearTimeout(timer);
  }, [stop.comments, staggerComments]);

  useEffect(() => {
    if (!commentPending && pendingText) setPendingText(null);
  }, [commentPending, pendingText]);

  const submit = () => {
    const text = draft.trim();
    if (!text || commentPending) return;
    setPendingText(text);
    onComment(stop.id, text);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center border-b border-border px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2"
          onClick={onClose}
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
          {t("detail.backToItinerary")}
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <CategoryIcon category={stop.category} />
            <InlineText
              value={stop.name}
              canEdit={canEdit}
              ariaLabel={t("detail.editName")}
              placeholder={t("detail.namePlaceholder")}
              onCommit={(name) => onUpdateStop(stop.id, { name })}
              displayClassName="min-w-0 flex-1 font-heading text-xl font-semibold tracking-tight leading-tight text-balance"
              inputClassName="min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 py-1 font-heading text-xl font-semibold tracking-tight leading-tight outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit ? (
              <>
                <ScheduleEditor
                  trip={trip}
                  stop={stop}
                  label={scheduleLabel}
                  onUpdateStop={onUpdateStop}
                  onChangeStopDay={onChangeStopDay}
                />
                <CategoryEditor stop={stop} onUpdateStop={onUpdateStop} />
                <CostEditor
                  trip={trip}
                  stop={stop}
                  label={costLabel}
                  onUpdateStop={onUpdateStop}
                />
              </>
            ) : (
              <>
                <Badge variant="secondary">{scheduleLabel}</Badge>
                <Badge variant="outline">{t(`category.${stop.category}`)}</Badge>
                <Badge variant="info">{costLabel}</Badge>
              </>
            )}
            {stop.votes.length ? (
              <Badge variant="secondary">
                {t("schedule.voteCount", { count: stop.votes.length })}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <InlineText
              value={stop.area}
              canEdit={canEdit}
              ariaLabel={t("detail.editArea")}
              placeholder={t("detail.areaPlaceholder")}
              onCommit={(area) => onUpdateStop(stop.id, { area })}
              displayClassName="w-fit text-sm text-muted-foreground"
              inputClassName="w-full rounded-md border border-ring bg-background px-1.5 py-1 text-sm outline-none"
            />
            <div className="flex items-center gap-2">
              <Avatar
                name={addedBy.name}
                bg={addedBy.avatarBg}
                fg={addedBy.avatarFg}
                src={addedBy.image}
                seed={addedBy.id}
                size={20}
              />
              <span className="text-sm text-muted-foreground">
                {t("detail.addedBy", { name: addedBy.shortName })}
              </span>
            </div>
          </div>
        </div>

        {stop.note ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-balance">{t("detail.notes")}</h3>
            <div className="wf-markdown text-sm leading-relaxed text-foreground/90">
              <ReactMarkdown
                components={{
                  a: ({ node, ...props }) => {
                    void node;
                    return (
                      <a {...props} target="_blank" rel="noreferrer noopener" />
                    );
                  },
                  img: ({ node, ...props }) => {
                    void node;
                    return <img {...props} alt={props.alt ?? ""} loading="lazy" />;
                  },
                }}
              >
                {stop.note}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {stop.votes.length ? (
                <div className="flex items-center">
                  {stop.votes.map((id, k) => {
                    const m = memberOf(trip, id);
                    return (
                      <Avatar
                        key={id}
                        name={m.name}
                        bg={m.avatarBg}
                        fg={m.avatarFg}
                        src={m.image}
                        seed={m.id}
                        size={24}
                        stackIndex={k}
                      />
                    );
                  })}
                </div>
              ) : (
                <span className="text-sm text-pretty text-muted-foreground">
                  {t("detail.noVotes")}
                </span>
              )}
              {stop.votes.length ? (
                <span className="text-sm text-pretty text-muted-foreground tabular-nums">
                  {t("detail.wantThis", {
                    count: stop.votes.length,
                    total: trip.members.length,
                  })}
                </span>
              ) : null}
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={voted ? "secondary" : "brand"}
                    size="sm"
                    className="size-8 px-0"
                    aria-label={voted ? t("detail.unvote") : t("detail.vote")}
                    onClick={() => onToggleVote(stop.id)}
                  />
                }
              >
                <VoteToggleIcon voted={voted} />
              </TooltipTrigger>
              <TooltipPopup>
                {voted ? t("detail.unvote") : t("detail.vote")}
              </TooltipPopup>
            </Tooltip>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col gap-3",
            staggerComments && "wf-enter-stagger",
          )}
        >
          <h3 className="text-sm font-semibold text-muted-foreground">
            {stop.comments.length
              ? t("detail.commentsWithCount", { count: stop.comments.length })
              : t("detail.commentsEmpty")}
          </h3>
          {stop.comments.map((c) => {
            const key = commentKey(c);
            const m = memberOf(trip, c.author);
            return (
              <div
                key={key}
                className={cn(
                  "flex gap-2.5",
                  (staggerComments || enteringKeys.has(key)) && "wf-enter",
                )}
              >
                <Avatar
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
                  src={m.image}
                  seed={m.id}
                  size={26}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{m.shortName}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {c.timeLabel}
                    </span>
                  </div>
                  <p className="text-sm leading-normal text-foreground text-pretty">
                    {c.text}
                  </p>
                </div>
              </div>
            );
          })}
          {pendingText ? (
            <div className="flex gap-2.5 wf-enter opacity-60">
              <Avatar
                name={currentUser.name}
                bg={currentUser.avatarBg}
                fg={currentUser.avatarFg}
                src={currentUser.image}
                seed={currentUser.id}
                size={26}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">
                    {currentUser.shortName}
                  </span>
                  <Spinner className="size-3 text-muted-foreground" />
                </div>
                <p className="text-sm leading-normal text-foreground text-pretty">
                  {pendingText}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-none gap-2 p-3 shadow-[0_-4px_8px_-4px_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("detail.commentPlaceholder")}
          disabled={commentPending}
          className="h-8 text-sm"
        />
        <Button
          variant="primary"
          size="sm"
          static={commentPending}
          disabled={commentPending || !draft.trim()}
          className="min-w-[3.25rem]"
          onClick={submit}
        >
          <span
            className="wf-icon-swap"
            data-state={commentPending ? "active" : undefined}
          >
            <span>{t("detail.postComment")}</span>
            <Spinner className="size-3.5" />
          </span>
        </Button>
      </div>
    </div>
  );
}
