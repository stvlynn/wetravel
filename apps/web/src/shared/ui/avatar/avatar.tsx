import { useMemo } from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn, planetAvatarUrl } from "@/shared/lib";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/shared/ui/tooltip";

export interface AvatarProps {
  name: string;
  bg: string;
  fg: string;
  /** Optional image URL. When provided and loadable, it replaces the fallback. */
  src?: string | null;
  /**
   * Stable identity used to generate a deterministic planet-style fallback
   * avatar when no `src` renders. When omitted, the fallback is a plain
   * `bg`/`fg` color chip.
   */
  seed?: string;
  size?: number;
  /** Stacked index: >0 applies a negative margin for clustering. */
  stackIndex?: number;
  /** Explicit paint order within a stack (higher sits on top). */
  zIndex?: number;
  className?: string;
}

export function Avatar({
  name,
  bg,
  fg,
  src,
  seed,
  size = 26,
  stackIndex,
  zIndex,
  className,
}: AvatarProps) {
  const stacked = stackIndex != null;
  const planetUri = useMemo(() => (seed ? planetAvatarUrl(seed) : null), [seed]);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <AvatarPrimitive.Root
            data-slot="avatar"
            aria-label={name}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
              className,
            )}
            style={{
              width: size,
              height: size,
              marginLeft: stacked && stackIndex > 0 ? -7 : 0,
              zIndex,
            }}
          />
        }
      >
        {src ? (
          <AvatarPrimitive.Image
            src={src}
            alt={name}
            className="size-full object-cover"
          />
        ) : null}
        <AvatarPrimitive.Fallback
          data-slot="avatar-fallback"
          className="flex size-full items-center justify-center rounded-full"
          style={planetUri ? undefined : { background: bg, color: fg }}
        >
          {planetUri ? (
            <img
              src={planetUri}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="size-full object-cover"
            />
          ) : null}
          <span className="sr-only">{name}</span>
        </AvatarPrimitive.Fallback>
      </TooltipTrigger>
      <TooltipPopup>{name}</TooltipPopup>
    </Tooltip>
  );
}
