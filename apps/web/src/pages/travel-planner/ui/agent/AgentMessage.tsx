import { useTranslation } from "react-i18next";
import { Copy, MapPinIcon } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import type { Trip } from "@/entities/trip";
import type { AgentMessageSource, AgentSuggestion } from "@/shared/api";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib";
import { AGENT_TOKEN } from "../mention";
import {
  parseLeadingQuote,
  QuoteBlock,
  ReplyHoverButton,
  type QuoteTarget,
} from "../quote";
import {
  AgentToolApprovalCard,
  AgentToolStatusLine,
} from "./AgentToolApprovalCard";
import { AgentToolPreview } from "./AgentToolPreview";
import { AgentReasoning } from "./AgentReasoning";
import { AgentAvatar } from "./AgentAvatar";
import { AgentGeneratedUi } from "./AgentGeneratedUi";
import { AgentGeneratedFallback } from "./AgentGeneratedFallback";
import { toolDisplayName } from "./toolDisplayName";
import { isAgentStatusPart } from "@opentrip/agent-ui-catalog";
import {
  fingerprintMessageText,
  textFromMessageParts,
} from "@opentrip/observability-contract";

/** AI SDK UI recommends Streamdown for incomplete streaming Markdown. */
function AgentMarkdown({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      className="wf-markdown"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming === true}
      caret={streaming ? "block" : undefined}
      controls={false}
      components={{
        a: ({ href, children, ...props }) => {
          if (href === "streamdown:incomplete-link") {
            return <span className="text-muted-foreground">{children}</span>;
          }
          return (
            <a {...props} href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </Streamdown>
  );
}

export interface AgentDisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** Better Auth user id of the human author when known. */
  actorUserId: string | null;
  actorName: string | null;
  source: AgentMessageSource;
  createdAt: string | null;
  /** Live AI SDK message parts (text, reasoning, tool approval UI). */
  parts?: UIMessage["parts"];
  /** True while this live assistant turn is still streaming. */
  streaming?: boolean;
  debugRequestId?: string;
  debugTurnId?: string;
}

/** Join AI SDK text parts the way the chatbot docs recommend. */
export function textFromParts(parts: UIMessage["parts"] | undefined): string {
  if (!parts?.length) return "";
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof (p as { text?: unknown }).text === "string",
    )
    .map((p) => p.text)
    .join("\n");
}

function filePartsFromMessage(
  parts: UIMessage["parts"] | undefined,
): Array<{
  mediaType: string;
  url: string;
  filename?: string;
}> {
  if (!parts?.length) return [];
  const out: Array<{ mediaType: string; url: string; filename?: string }> = [];
  for (const part of parts) {
    if (part.type !== "file") continue;
    const mediaType =
      typeof (part as { mediaType?: unknown }).mediaType === "string"
        ? (part as { mediaType: string }).mediaType
        : "";
    const url =
      typeof (part as { url?: unknown }).url === "string"
        ? (part as { url: string }).url
        : "";
    if (!mediaType || !url) continue;
    const filename =
      typeof (part as { filename?: unknown }).filename === "string"
        ? (part as { filename: string }).filename
        : undefined;
    out.push({ mediaType, url, filename });
  }
  return out;
}

function AgentFileAttachments({
  files,
  align,
}: {
  files: Array<{ mediaType: string; url: string; filename?: string }>;
  align: "start" | "end";
}) {
  const { t } = useTranslation("agent");
  if (files.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {files.map((file, i) => {
        const key = `${file.url}-${i}`;
        if (file.mediaType.startsWith("image/")) {
          return (
            <a
              key={key}
              href={file.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block overflow-hidden rounded-lg border border-border"
            >
              <img
                src={file.url}
                alt={file.filename ?? t("attach.imageAlt")}
                className="max-h-48 max-w-[14rem] object-cover"
              />
            </a>
          );
        }
        return (
          <a
            key={key}
            href={file.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            <span className="min-w-0 truncate">
              {file.filename ?? t("attach.fileFallback")}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function reasoningFromParts(parts: UIMessage["parts"] | undefined): {
  text: string;
  streaming: boolean;
} | null {
  if (!parts?.length) return null;
  const reasoning = parts.filter(
    (p): p is { type: "reasoning"; text: string; state?: "streaming" | "done" } =>
      p.type === "reasoning" &&
      typeof (p as { text?: unknown }).text === "string",
  );
  if (reasoning.length === 0) return null;
  return {
    text: reasoning.map((p) => p.text).join("\n"),
    streaming: reasoning.some((p) => p.state === "streaming"),
  };
}

/** The backend prefixes stop comments that mention @agent with a machine
 * context tag (see `addComment` in the API). Split it out so the chat can
 * render it as a chip instead of leaking the raw marker into the bubble. */
const STOP_CONTEXT_PATTERN = /^\(commenting on stop "(.*?)"\)\s*/;

function parseStopContext(text: string): {
  stopName: string | null;
  body: string;
} {
  const match = text.match(STOP_CONTEXT_PATTERN);
  if (!match) return { stopName: null, body: text };
  return { stopName: match[1] ?? null, body: text.slice(match[0].length) };
}

function timeLabel(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** One entry in the shared session timeline: member/agent messages as bubbles,
 * operation events as quiet gray lines, tool approval cards, and proactive
 * suggestion approve actions. */
export function AgentMessageItem({
  message,
  trip,
  suggestion,
  canEdit,
  applying,
  onApproveSuggestion,
  onDenySuggestion,
  onToolApprove,
  onToolDeny,
  onGeneratedFollowUp,
  onGeneratedFocusDay,
  onGeneratedFocusStop,
  onReply,
}: {
  message: AgentDisplayMessage;
  trip: Trip;
  suggestion?: AgentSuggestion;
  canEdit: boolean;
  applying: boolean;
  onApproveSuggestion: (suggestion: AgentSuggestion) => void;
  onDenySuggestion?: (suggestion: AgentSuggestion) => void;
  onToolApprove?: (approvalId: string) => void;
  onToolDeny?: (approvalId: string) => void;
  onGeneratedFollowUp: (message: string) => Promise<void>;
  onGeneratedFocusDay: (dayNumber: number) => void;
  onGeneratedFocusStop: (stopId: string) => void;
  onReply?: (target: QuoteTarget) => void;
}) {
  const { t, i18n } = useTranslation("agent");

  if (message.role === "system" || message.source === "operation") {
    return (
      <div className="px-1 py-0.5 text-center text-[11px] text-muted-foreground/80">
        {message.actorName ? `${message.actorName} ` : ""}
        {message.text}
      </div>
    );
  }

  const isAgent = message.role === "assistant";
  const toolParts = (message.parts ?? []).filter(isToolUIPart);
  const generatedFallback = (message.parts ?? []).find(isAgentStatusPart);
  // Prefer live AI SDK parts so text deltas re-render while streaming; fall
  // back to the flattened `text` field for persisted history rows.
  const displayText =
    message.parts?.length ? textFromParts(message.parts) : message.text;
  const fileAttachments = filePartsFromMessage(message.parts);
  const reasoning = isAgent ? reasoningFromParts(message.parts) : null;
  const { stopName, body: stopBody } = parseStopContext(displayText);
  const { quote, body } = parseLeadingQuote(stopBody);
  const showThinking =
    isAgent &&
    message.streaming === true &&
    !body &&
    !quote &&
    !fileAttachments.length &&
    !toolParts.length &&
    !(reasoning?.text);

  // Match the author to a trip member for their avatar. Prefer userId so
  // duplicate display names still resolve to distinct members. Live messages
  // this client just sent carry no actor yet, so fall back to the current user.
  const member = isAgent
    ? undefined
    : message.actorUserId
      ? trip.members.find((m) => m.userId === message.actorUserId)
      : message.actorName
        ? trip.members.find((m) => m.name === message.actorName)
        : trip.members.find((m) => m.isCurrentUser);

  const isOwnMessage =
    !isAgent &&
    (member?.isCurrentUser ??
      (!message.actorUserId && !message.actorName));
  const authorLabel = isAgent
    ? t("panel.agentName")
    : (message.actorName ?? member?.name ?? t("panel.systemName"));
  const replyText = (body.trim() || quote?.text || "").trim();
  const canReply =
    Boolean(onReply) &&
    !isOwnMessage &&
    !message.streaming &&
    Boolean(replyText);

  const handleReply = () => {
    if (!onReply || !replyText) return;
    onReply({
      author: authorLabel,
      text: replyText,
      mentionToken: isAgent ? AGENT_TOKEN : member?.name,
    });
  };

  const copyDebugInfo = async () => {
    const text = textFromMessageParts(message.parts ?? []);
    const toolCallIds = (message.parts ?? [])
      .filter(isToolUIPart)
      .map((part) => part.toolCallId);
    const payload = {
      tripId: trip.id,
      messageId: message.id,
      turnId: message.debugTurnId,
      requestId: message.debugRequestId,
      source: message.source,
      createdAt: message.createdAt,
      toolCallIds,
      messageFingerprint: text
        ? await fingerprintMessageText(text)
        : undefined,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  const avatar = isAgent ? (
    <AgentAvatar />
  ) : member ? (
    <Avatar
      name={member.name}
      bg={member.avatarBg}
      fg={member.avatarFg}
      src={member.image}
      seed={member.id}
      size={24}
    />
  ) : (
    <Avatar
      name={message.actorName ?? t("panel.systemName")}
      bg="var(--secondary)"
      fg="var(--ink-600)"
      seed={message.actorName ?? message.id}
      size={24}
    />
  );

  return (
    <div className={cn("group/message flex flex-col gap-1", isAgent ? "items-start" : "items-end")}>
      <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
        <span>{authorLabel}</span>
        <span className="tabular-nums">{timeLabel(message.createdAt, i18n.language)}</span>
        <button
          type="button"
          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover/message:opacity-100 focus-visible:opacity-100"
          title={t("debug.copy")}
          aria-label={t("debug.copy")}
          onClick={() => void copyDebugInfo()}
        >
          <Copy aria-hidden="true" className="size-3" />
        </button>
      </div>
      <div
        className={cn(
          "group flex w-full items-start gap-1.5",
          isAgent ? "flex-row" : "flex-row-reverse",
        )}
      >
        {avatar}
        <div
          className={cn(
            "flex min-w-0 max-w-[85%] flex-col gap-1",
            isAgent ? "items-start" : "items-end",
          )}
        >
          {stopName ? (
            <div
              className={cn(
                "flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
                isAgent ? "self-start" : "self-end",
              )}
            >
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">
                {t("context.commentingOnStop", { stop: stopName })}
              </span>
            </div>
          ) : null}

          {reasoning?.text ? (
            <AgentReasoning
              text={reasoning.text}
              streaming={reasoning.streaming}
            />
          ) : null}

          {showThinking ? (
            <div className="flex w-fit items-center gap-2 rounded-xl rounded-tl-sm bg-accent px-3 py-2 text-xs text-muted-foreground">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground/70" />
              {t("panel.thinking")}
            </div>
          ) : null}

          {fileAttachments.length > 0 ? (
            <AgentFileAttachments
              files={fileAttachments}
              align={isAgent ? "start" : "end"}
            />
          ) : null}

          {body || quote ? (
            <div className="relative w-fit max-w-full">
              <div
                className={cn(
                  "w-fit max-w-full rounded-xl px-3 py-2 text-sm",
                  isAgent
                    ? "rounded-tl-sm bg-accent text-foreground"
                    : "rounded-tr-sm bg-corn-100 text-foreground dark:bg-corn-950",
                )}
              >
                {quote ? <QuoteBlock quote={quote} /> : null}
                {body ? (
                  isAgent ? (
                    <AgentMarkdown text={body} streaming={message.streaming} />
                  ) : (
                    <span className="whitespace-pre-wrap">{body}</span>
                  )
                ) : null}
              </div>
              {canReply ? (
                <ReplyHoverButton
                  label={t("quote.reply")}
                  onClick={handleReply}
                  className={cn(
                    "absolute top-0",
                    // Sit outside the bubble, flush with its top edge.
                    isAgent ? "left-full ml-1" : "right-full mr-1",
                  )}
                />
              ) : null}
            </div>
          ) : null}

          {isAgent && generatedFallback ? (
            <AgentGeneratedFallback
              reason={generatedFallback.data.reason}
              onRetry={onGeneratedFollowUp}
            />
          ) : isAgent && message.parts?.length ? (
            <AgentGeneratedUi
              parts={message.parts}
              streaming={message.streaming === true}
              onSendFollowUp={onGeneratedFollowUp}
              onFocusDay={onGeneratedFocusDay}
              onFocusStop={onGeneratedFocusStop}
            />
          ) : null}

          {toolParts.map((part) => {
        const name = getToolName(part);
        const label = toolDisplayName(t, name);
        const key = part.toolCallId;

        if (part.state === "approval-requested" && !part.approval?.isAutomatic) {
          return (
            <AgentToolApprovalCard
              key={key}
              toolName={name}
              input={part.input}
              trip={trip}
              approvalId={part.approval.id}
              canEdit={canEdit}
              onApprove={(id) => onToolApprove?.(id)}
              onDeny={(id) => onToolDeny?.(id)}
            />
          );
        }

        if (part.state === "approval-responded") {
          return (
            <AgentToolStatusLine
              key={key}
              label={
                part.approval.approved
                  ? t("tool.approved", { tool: label })
                  : t("tool.denied", { tool: label })
              }
              tone={part.approval.approved ? "success" : "danger"}
              preview={
                <AgentToolPreview toolName={name} input={part.input} trip={trip} />
              }
            />
          );
        }

        if (part.state === "output-available") {
          return (
            <AgentToolStatusLine
              key={key}
              label={t("tool.applied", { tool: label })}
              tone="success"
              autoDismiss
              preview={
                <AgentToolPreview toolName={name} input={part.input} trip={trip} />
              }
            />
          );
        }

        if (part.state === "output-denied") {
          return (
            <AgentToolStatusLine
              key={key}
              label={t("tool.denied", { tool: label })}
              tone="danger"
              preview={
                <AgentToolPreview toolName={name} input={part.input} trip={trip} />
              }
            />
          );
        }

        if (part.state === "input-available" || part.state === "input-streaming") {
          return (
            <AgentToolStatusLine
              key={key}
              label={t("tool.running", { tool: label })}
            />
          );
        }

        return null;
      })}

          {suggestion && suggestion.status === "pending" && canEdit ? (
            <div className="mt-0.5 flex w-full flex-col gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
              <span className="text-xs text-pretty text-muted-foreground">
                {suggestion.suggestionText}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                {onDenySuggestion ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={applying}
                    onClick={() => onDenySuggestion(suggestion)}
                  >
                    {t("approval.deny")}
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  disabled={applying}
                  onClick={() => onApproveSuggestion(suggestion)}
                >
                  {t("approval.approve")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
