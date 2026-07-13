import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpIcon, FileIcon, PaperclipIcon, XIcon } from "lucide-react";
import type { Trip } from "@/entities/trip";
import { TRIP_MEDIA_ACCEPT } from "@/shared/api";
import { Spinner } from "@/shared/ui/spinner";
import { MentionListbox, useMentionInput } from "../mention";
import {
  composeWithQuote,
  QuotePreview,
  type QuoteTarget,
} from "../quote";

const MAX_ATTACHMENTS = 8;

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

function revokePreviews(files: PendingFile[]) {
  for (const item of files) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}

/** Chat composer with `@`-mentions and multimodal file attachments. */
export function AgentComposer({
  trip,
  onSend,
  quote = null,
  onClearQuote,
}: {
  trip: Trip;
  onSend: (text: string, files?: File[]) => Promise<void>;
  quote?: QuoteTarget | null;
  onClearQuote?: () => void;
}) {
  const { t } = useTranslation("agent");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef(attachments);

  const mention = useMentionInput({
    trip,
    value: draft,
    setValue: setDraft,
    inputRef: textareaRef,
    listId: "agent-mention-list",
  });

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => revokePreviews(attachmentsRef.current);
  }, []);

  useEffect(() => {
    if (!quote) return;
    textareaRef.current?.focus();
  }, [quote]);

  const canSend =
    (draft.trim().length > 0 ||
      attachments.length > 0 ||
      Boolean(quote)) &&
    !sending;

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setAttachments((prev) => {
      const room = MAX_ATTACHMENTS - prev.length;
      if (room <= 0) return prev;
      const next = [...prev];
      for (const file of Array.from(list).slice(0, room)) {
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
        });
      }
      return next;
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const submit = useCallback(async () => {
    const text = composeWithQuote(quote, draft);
    if ((!text && attachments.length === 0) || sending) return;
    const files = attachments.map((a) => a.file);
    setDraft("");
    mention.dismiss();
    onClearQuote?.();
    revokePreviews(attachments);
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(true);
    try {
      await onSend(text, files);
    } finally {
      setSending(false);
    }
  }, [draft, attachments, sending, onSend, mention.dismiss, quote, onClearQuote]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const pasted =
      inputType === "insertFromPaste" || inputType === "insertFromDrop";
    const caret = e.target.selectionStart ?? value.length;
    mention.syncFromInput(value, caret, { pasted });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.onKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative flex flex-none flex-col gap-1.5 px-3 py-2.5">
      {mention.open ? (
        <MentionListbox
          listId={mention.listId}
          listRef={mention.listRef}
          items={mention.items}
          activeIndex={mention.activeIndex}
          onSelect={mention.insertMention}
          onHover={mention.setActiveIndex}
          optionId={mention.optionId}
        />
      ) : null}

      {quote ? (
        <QuotePreview
          quote={quote}
          dismissLabel={t("quote.dismiss")}
          onDismiss={() => onClearQuote?.()}
        />
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((item) => (
            <div
              key={item.id}
              className="group relative flex max-w-[9rem] items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-1"
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-8 rounded object-cover"
                />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                {item.file.name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(item.id)}
                disabled={sending}
                aria-label={t("attach.remove")}
                className="wf-interactive wf-pressable flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={TRIP_MEDIA_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || attachments.length >= MAX_ATTACHMENTS}
          aria-label={t("attach.add")}
          title={t("attach.add")}
          className="wf-interactive wf-pressable flex size-9 flex-none items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:border-ring/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <PaperclipIcon className="size-4" aria-hidden />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          placeholder={t("panel.inputPlaceholder")}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={mention.dismiss}
          {...mention.aria}
          className="max-h-28 min-h-9 w-full flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-md outline-none placeholder:text-muted-foreground/70 hover:border-ring/50 focus:border-ring md:text-sm"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
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
    </div>
  );
}
