import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpIcon } from "lucide-react";
import type { Trip } from "@/entities/trip";
import { Avatar } from "@/shared/ui/avatar";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib";
import { AgentAvatar } from "./AgentAvatar";

/** Literal token the backend matches (`/@agent\b/`) to stream an agent reply. */
const AGENT_TOKEN = "agent";

interface MentionCandidate {
  key: string;
  /** Text inserted after `@`. */
  token: string;
  label: string;
  kind: "agent" | "member";
  member?: Trip["members"][number];
}

interface ActiveMention {
  /** Index of the triggering `@` in the draft. */
  start: number;
  /** Text between `@` and the caret. */
  query: string;
}

/**
 * Find an active `@mention` token ending at the caret. Returns null when the
 * caret is not inside a mention: no preceding `@`, the `@` is not at a word
 * boundary (start-of-text or after whitespace), or whitespace already closed
 * the token.
 */
export function detectMention(
  value: string,
  caret: number,
): ActiveMention | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i]!;
    if (ch === "@") {
      const before = i === 0 ? "" : value[i - 1]!;
      if (before === "" || /\s/.test(before)) {
        return { start: i, query: value.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/** Chat composer with an inline `@`-mention list (trip members + the agent).
 * The list opens only when `@` is typed — never on paste/drop — and supports
 * Up/Down to move, Tab or Enter to accept, and Escape to dismiss. */
export function AgentComposer({
  trip,
  onSend,
}: {
  trip: Trip;
  onSend: (text: string) => Promise<void>;
}) {
  const { t } = useTranslation("agent");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const candidates = useMemo<MentionCandidate[]>(() => {
    const agent: MentionCandidate = {
      key: "agent",
      token: AGENT_TOKEN,
      label: t("panel.agentName"),
      kind: "agent",
    };
    const members = trip.members
      .filter((m) => !m.isCurrentUser)
      .map<MentionCandidate>((m) => ({
        key: m.id,
        token: m.name,
        label: m.name,
        kind: "member",
        member: m,
      }));
    return [agent, ...members];
  }, [trip.members, t]);

  const items = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.token.toLowerCase().includes(q) ||
        (c.kind === "agent" && AGENT_TOKEN.includes(q)),
    );
  }, [mention, candidates]);

  const open = mention !== null && items.length > 0;

  // Keep the highlighted option scrolled into view as the user navigates.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Restore focus and caret after a mention is inserted into the draft.
  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
    }
    pendingCaretRef.current = null;
  }, [draft]);

  const insertMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mention) return;
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? draft.length;
      const before = draft.slice(0, mention.start);
      const after = draft.slice(caret);
      const inserted = `@${candidate.token} `;
      setDraft(before + inserted + after);
      setMention(null);
      pendingCaretRef.current = before.length + inserted.length;
    },
    [mention, draft],
  );

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setMention(null);
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }, [draft, sending, onSend]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const pasted =
      inputType === "insertFromPaste" || inputType === "insertFromDrop";
    const caret = e.target.selectionStart ?? value.length;
    setMention(pasted ? null : detectMention(value, caret));
    setActiveIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        insertMention(items[activeIndex] ?? items[0]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative flex flex-none items-end gap-1.5 px-3 py-2.5">
      {open ? (
        <div
          ref={listRef}
          id="agent-mention-list"
          role="listbox"
          aria-label={t("mention.listLabel")}
          className="absolute inset-x-3 bottom-full mb-2 max-h-56 overflow-y-auto rounded-lg bg-popover p-1 shadow-[var(--shadow-border),var(--shadow-lg)]"
        >
          {items.map((c, i) => (
            <button
              key={c.key}
              type="button"
              role="option"
              id={`agent-mention-${i}`}
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(c);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground",
              )}
            >
              {c.kind === "agent" ? (
                <AgentAvatar />
              ) : (
                <Avatar
                  name={c.member!.name}
                  bg={c.member!.avatarBg}
                  fg={c.member!.avatarFg}
                  src={c.member!.image}
                  seed={c.member!.id}
                  size={24}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.kind === "agent" ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  @{AGENT_TOKEN}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        value={draft}
        rows={1}
        placeholder={t("panel.inputPlaceholder")}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setMention(null)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? "agent-mention-list" : undefined}
        aria-activedescendant={open ? `agent-mention-${activeIndex}` : undefined}
        className="max-h-28 min-h-9 w-full flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 hover:border-ring/50 focus:border-ring"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!draft.trim() || sending}
        aria-label={t("panel.send")}
        title={t("panel.send")}
        className="wf-interactive wf-pressable flex size-9 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {sending ? (
          <Spinner className="size-4" />
        ) : (
          <ArrowUpIcon className="size-4" />
        )}
      </button>
    </div>
  );
}
