import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@/shared/lib";

export interface AvatarProps {
  initials: string;
  name: string;
  bg: string;
  fg: string;
  size?: number;
  /** Stacked index: >0 applies a negative margin + card ring for clustering. */
  stackIndex?: number;
  /** Explicit paint order within a stack (higher sits on top). */
  zIndex?: number;
  /** Visual online presence dot (bottom-right). */
  online?: boolean;
  className?: string;
}

export function Avatar({
  initials,
  name,
  bg,
  fg,
  size = 26,
  stackIndex,
  zIndex,
  online,
  className,
}: AvatarProps) {
  const stacked = stackIndex != null;
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      title={name}
      aria-label={name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full font-semibold select-none",
        stacked && "ring-2 ring-card",
        className,
      )}
      style={{
        width: size,
        height: size,
        marginLeft: stacked && stackIndex > 0 ? -7 : 0,
        zIndex,
      }}
    >
      <AvatarPrimitive.Fallback
        data-slot="avatar-fallback"
        className="flex size-full items-center justify-center rounded-full"
        style={{
          background: bg,
          color: fg,
          fontSize: Math.round(size * 0.38),
        }}
      >
        {initials}
      </AvatarPrimitive.Fallback>
      {online ? (
        <span
          aria-hidden="true"
          className="absolute -right-px -bottom-px size-[9px] rounded-full border-2 border-card bg-[oklch(0.62_0.13_162)]"
        />
      ) : null}
    </AvatarPrimitive.Root>
  );
}
