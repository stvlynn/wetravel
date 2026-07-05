import type React from "react";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn, popupMotionClasses } from "@/shared/lib";

/** coss-style Autocomplete adapted to wetravel tokens (Base UI under the hood).
 * Uses a native styled input, a plain scroll popup, and inline icons so it has
 * no coss registry / lucide dependencies. */
export const Autocomplete: typeof AutocompletePrimitive.Root =
  AutocompletePrimitive.Root;

const inputBase =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground/70 transition-[background-color,border-color] duration-150 " +
  "ease-[var(--ease-out)] outline-none hover:border-ring/50 hover:bg-accent/40 " +
  "focus:border-ring focus:bg-background focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function AutocompleteInput({
  className,
  showClear = false,
  startAddon,
  clearProps,
  ...props
}: AutocompletePrimitive.Input.Props & {
  showClear?: boolean;
  startAddon?: React.ReactNode;
  clearProps?: AutocompletePrimitive.Clear.Props;
}): React.ReactElement {
  return (
    <AutocompletePrimitive.InputGroup
      className="relative w-full text-foreground"
      data-slot="autocomplete-input-group"
    >
      {startAddon && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3 text-muted-foreground [&_svg]:size-4"
          data-slot="autocomplete-start-addon"
        >
          {startAddon}
        </div>
      )}
      <AutocompletePrimitive.Input
        className={cn(
          inputBase,
          startAddon && "pl-9",
          showClear && "pr-12",
          className,
        )}
        data-slot="autocomplete-input"
        {...props}
      />
      {showClear && (
        <AutocompletePrimitive.Clear
          className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-80 outline-none transition-[background-color,color,opacity,scale] hover:bg-accent hover:opacity-100 active:scale-[0.96]"
          data-slot="autocomplete-clear"
          {...clearProps}
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
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </AutocompletePrimitive.Clear>
      )}
    </AutocompletePrimitive.InputGroup>
  );
}

export function AutocompletePopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  portalProps,
  ...props
}: AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"];
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"];
  side?: AutocompletePrimitive.Positioner.Props["side"];
  portalProps?: AutocompletePrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <AutocompletePrimitive.Portal {...portalProps}>
      <AutocompletePrimitive.Positioner
        align={align}
        className="z-50 select-none"
        data-slot="autocomplete-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <AutocompletePrimitive.Popup
          className={cn(
            "max-h-[min(var(--available-height),22rem)] w-(--anchor-width) max-w-(--available-width) " +
              "overflow-hidden rounded-lg bg-popover text-foreground shadow-[var(--shadow-border),var(--shadow-lg)]",
            popupMotionClasses,
            className,
          )}
          data-slot="autocomplete-popup"
          {...props}
        >
          {children}
        </AutocompletePrimitive.Popup>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}

export function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.List
      className={cn("max-h-[20rem] overflow-y-auto p-1", className)}
      data-slot="autocomplete-list"
      {...props}
    />
  );
}

export function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Item
      className={cn(
        "flex min-h-10 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-[background-color,color,scale] duration-150 active:scale-[0.96]",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-60",
        className,
      )}
      data-slot="autocomplete-item"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

export function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Empty
      className={cn(
        "not-empty:p-3 text-center text-sm text-muted-foreground",
        className,
      )}
      data-slot="autocomplete-empty"
      {...props}
    />
  );
}

export function AutocompleteStatus({
  className,
  ...props
}: AutocompletePrimitive.Status.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Status
      className={cn(
        "px-3 py-2 text-xs font-medium text-muted-foreground empty:m-0 empty:p-0",
        className,
      )}
      data-slot="autocomplete-status"
      {...props}
    />
  );
}

export const useAutocompleteFilter = AutocompletePrimitive.useFilter;

export { AutocompletePrimitive };
