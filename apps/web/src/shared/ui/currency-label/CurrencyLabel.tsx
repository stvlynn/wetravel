import { currencyDisplayName } from "@/shared/lib";
import { cn } from "@/shared/lib/cn";

/** ISO code + localized name; name is muted for hierarchy. */
export function CurrencyLabel({
  code,
  locale,
  className,
}: {
  code: string;
  locale: string;
  className?: string;
}) {
  const normalized = code.trim().toUpperCase();
  const name = currencyDisplayName(normalized, locale);
  const showName = Boolean(name && name !== normalized);

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-baseline gap-1.5 text-left",
        className,
      )}
    >
      <span className="shrink-0 tabular-nums text-foreground">{normalized}</span>
      {showName ? (
        <span className="truncate text-muted-foreground">{name}</span>
      ) : null}
    </span>
  );
}
