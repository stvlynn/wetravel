/** Localized "time ago" label for an ISO timestamp.
 *
 * Uses `Intl.RelativeTimeFormat` for recent instants (seconds → days) and falls
 * back to an absolute localized date for anything older than a week. */
export function formatRelativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const diffMs = then - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), "second");
  const absMin = absSec / 60;
  if (absMin < 60) return rtf.format(Math.round(diffMs / 60000), "minute");
  const absHour = absMin / 60;
  if (absHour < 24) return rtf.format(Math.round(diffMs / 3600000), "hour");
  const absDay = absHour / 24;
  if (absDay < 7) return rtf.format(Math.round(diffMs / 86400000), "day");

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(then);
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Format an instant as `YYYY-MM-DDTHH:mm` wall time in `timeZone`. */
export function toZonedDateTimeLocal(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = zonedParts(date, timeZone);
    return `${pad(parts.year)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
  } catch {
    return "";
  }
}

/**
 * Encode a `datetime-local` wall time in `timeZone` as a UTC ISO instant.
 * Does not use the browser's local timezone for interpretation.
 */
export function fromZonedDateTimeLocal(
  localValue: string,
  timeZone: string,
): string {
  const match = LOCAL_INPUT.exec(localValue.trim());
  if (!match) {
    throw new Error("Invalid datetime-local value");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Start from the UTC reading of the wall clock, then correct by the zone
  // offset observed when that instant is formatted in `timeZone`.
  let utcMs = desired;
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    utcMs += desired - asUtc;
  }

  const verified = zonedParts(new Date(utcMs), timeZone);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    throw new Error(`Invalid local time in timezone ${timeZone}`);
  }
  return new Date(utcMs).toISOString();
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
