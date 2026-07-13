import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Back-to-trips button with an inline rename affordance for the trip title. */
export function BackButton({
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
