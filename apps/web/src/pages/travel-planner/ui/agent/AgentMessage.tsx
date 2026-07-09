import { useTranslation } from "react-i18next";
import { MapPinIcon } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import type { Trip } from "@/entities/trip";
import type { AgentMessageSource, AgentSuggestion } from "@/shared/api";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib";
import {
  AgentToolApprovalCard,
  AgentToolStatusLine,
} from "./AgentToolApprovalCard";
import { AgentToolPreview } from "./AgentToolPreview";
import { AgentReasoning } from "./AgentReasoning";
import { AgentAvatar } from "./AgentAvatar";
import { toolDisplayName } from "./toolDisplayName";

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
  actorName: string | null;
  source: AgentMessageSource;
  createdAt: string | null;
  /** Live AI SDK message parts (text, reasoning, tool approval UI). */
  parts?: UIMessage["parts"];
  /** True while this live assistant turn is still streaming. */
  streaming?: boolean;
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
  // Prefer live AI SDK parts so text deltas re-render while streaming; fall
  // back to the flattened `text` field for persisted history rows.
  const displayText =
    message.parts?.length ? textFromParts(message.parts) : message.text;
  const reasoning = isAgent ? reasoningFromParts(message.parts) : null;
  const { stopName, body } = parseStopContext(displayText);
  const showThinking =
    isAgent &&
    message.streaming === true &&
    !body &&
    !toolParts.length &&
    !(reasoning?.text);

  // Match the author to a trip member for their avatar. Live messages this
  // client just sent carry no actorName yet, so fall back to the current user.
  const member = isAgent
    ? undefined
    : message.actorName
      ? trip.members.find((m) => m.name === message.actorName)
      : trip.members.find((m) => m.isCurrentUser);

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
    <div className={cn("flex flex-col gap-1", isAgent ? "items-start" : "items-end")}>
      <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
        <span>
          {isAgent ? t("panel.agentName") : (message.actorName ?? t("panel.systemName"))}
        </span>
        <span className="tabular-nums">{timeLabel(message.createdAt, i18n.language)}</span>
      </div>
      <div
        className={cn(
          "flex w-full items-start gap-2",
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

          {body ? (
            <div
              className={cn(
                "w-fit max-w-full rounded-xl px-3 py-2 text-sm",
                isAgent
                  ? "rounded-tl-sm bg-accent text-foreground"
                  : "whitespace-pre-wrap rounded-tr-sm bg-corn-100 text-foreground dark:bg-corn-950",
              )}
            >
              {isAgent ? (
                <AgentMarkdown text={body} streaming={message.streaming} />
              ) : (
                body
              )}
            </div>
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
