import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import type { Trip } from "@/entities/trip";
import { CategoryIcon, type Stop, type StopComment } from "@/entities/stop";
import type { TripMember } from "@/entities/member";
import { cn, formatMoney } from "@/shared/lib";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { IconSwap } from "@/shared/ui/icon-swap";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/shared/ui/tooltip";

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

export function StopDetail({
  trip,
  stop,
  currentUserId,
  onClose,
  onToggleVote,
  onComment,
  commentPending = false,
}: {
  trip: Trip;
  stop: Stop;
  currentUserId: string;
  onClose: () => void;
  onToggleVote: (stopId: string) => void;
  onComment: (stopId: string, text: string) => void;
  commentPending?: boolean;
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
            <h2 className="min-w-0 flex-1 font-heading text-xl font-semibold tracking-tight leading-tight text-balance">
              {stop.name}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {t("detail.dayTime", {
                day: stop.day,
                time: stop.time,
                dur: stop.duration,
              })}
            </Badge>
            <Badge variant="outline">{t(`category.${stop.category}`)}</Badge>
            <Badge variant="info">
              {stop.cost
                ? t("detail.perPerson", {
                    amount: formatMoney(
                      stop.cost,
                      stop.costCurrency || trip.currency,
                    ),
                  })
                : t("detail.free")}
            </Badge>
            {stop.votes.length ? (
              <Badge variant="secondary">
                {t("schedule.voteCount", { count: stop.votes.length })}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            {stop.area ? (
              <p className="text-sm text-muted-foreground">{stop.area}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <Avatar
                initials={addedBy.initials}
                name={addedBy.name}
                bg={addedBy.avatarBg}
                fg={addedBy.avatarFg}
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
                        initials={m.initials}
                        name={m.name}
                        bg={m.avatarBg}
                        fg={m.avatarFg}
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
                  initials={m.initials}
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
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
                initials={currentUser.initials}
                name={currentUser.name}
                bg={currentUser.avatarBg}
                fg={currentUser.avatarFg}
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
