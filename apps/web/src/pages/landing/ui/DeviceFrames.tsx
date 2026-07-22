import { cn } from "@/shared/lib";
import { SHOT_HEIGHT, SHOT_WIDTH } from "../lib/content";

/** Desktop capture in a restrained browser chrome. Outer radius (16px) clips
 * the image so its bottom corners stay concentric with the frame. */
export function BrowserFrame({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-lg)] ring-1 ring-border",
        className,
      )}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border bg-secondary/60 px-3">
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </div>
      <img
        src={src}
        alt={alt}
        width={SHOT_WIDTH}
        height={SHOT_HEIGHT}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="block h-auto w-full"
      />
    </figure>
  );
}

/** Phone capture in a rounded bezel. Bezel padding (6px) keeps the inner screen
 * radius concentric with the outer shell. */
export function PhoneFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "w-full max-w-[220px] rounded-[2.25rem] bg-card p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-border",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={390}
        height={844}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-[1.75rem]"
      />
    </figure>
  );
}
