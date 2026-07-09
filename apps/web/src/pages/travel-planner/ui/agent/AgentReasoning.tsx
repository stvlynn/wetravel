import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import { cn } from "@/shared/lib";

/** Mirrors the AI SDK UI `Reasoning` element: the panel auto-opens while the
 * model is thinking and collapses shortly after it finishes, once, so users
 * can still expand it manually afterwards. */
const AUTO_CLOSE_DELAY_MS = 1000;
const MS_IN_S = 1000;

export function AgentReasoning({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const { t } = useTranslation("agent");
  const [open, setOpen] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track how long reasoning streamed so we can label the collapsed trigger.
  useEffect(() => {
    if (streaming) {
      if (startTime === null) setStartTime(Date.now());
    } else if (startTime !== null) {
      setDuration(Math.max(1, Math.round((Date.now() - startTime) / MS_IN_S)));
      setStartTime(null);
    }
  }, [streaming, startTime]);

  // Auto-collapse once, a beat after streaming ends.
  useEffect(() => {
    if (streaming || hasAutoClosed || !open) return;
    const timer = setTimeout(() => {
      setOpen(false);
      setHasAutoClosed(true);
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [streaming, hasAutoClosed, open]);

  // Keep the newest reasoning in view while it streams past the max height.
  useEffect(() => {
    if (!streaming) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, streaming]);

  const label = streaming
    ? t("reasoning.thinking")
    : duration
      ? t("reasoning.thoughtFor", { count: duration })
      : t("reasoning.thought");

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="w-fit max-w-full"
    >
      <CollapsibleTrigger
        className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <BrainIcon className={cn("size-3.5", streaming && "animate-pulse")} />
        <span>{label}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel className="wf-collapsible-panel">
        <div
          ref={scrollRef}
          className="scrollbar-overlay mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl rounded-tl-sm bg-accent/60 px-3 py-2 text-xs text-muted-foreground"
        >
          {text}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
