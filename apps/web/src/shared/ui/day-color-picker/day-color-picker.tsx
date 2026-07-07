import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib";
import { Avatar } from "@/shared/ui/avatar";
import "./day-color-picker.css";
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTrigger,
} from "@/shared/ui/popover";

export const DEFAULT_DAY_COLOR_PRESETS = [
  "#3f6fc9",
  "#305bb0",
  "#28304a",
  "#3c8f6f",
  "#6d788f",
  "#8a5cc0",
  "#c06a3c",
  "#e91e63",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#6366f1",
];

interface DayColorPickerContentProps {
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
}

export function DayColorPickerContent({
  value,
  onChange,
  presets = DEFAULT_DAY_COLOR_PRESETS,
}: DayColorPickerContentProps) {
  const { t } = useTranslation("planner");
  const [showCustom, setShowCustom] = useState(false);
  const normalizedValue = normalizeHex(value);
  const isCustom = !presets.some((c) => normalizeHex(c) === normalizedValue);

  return (
    <div className="flex w-[260px] flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("schedule.colorPicker.presets")}
        </span>
        <div className="flex flex-wrap gap-2">
          {presets.map((color) => {
            const normalized = normalizeHex(color);
            const selected = normalizedValue === normalized;
            return (
              <button
                key={normalized}
                type="button"
                onClick={() => {
                  onChange(normalized);
                  setShowCustom(false);
                }}
                aria-label={t("schedule.colorPicker.pick", { color: normalized })}
                className={cn(
                  "relative flex size-7 flex-none items-center justify-center rounded-full p-0.5 transition-[box-shadow,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2 ring-ring",
                )}
              >
                <Avatar
                  name={normalized}
                  bg={normalized}
                  fg="transparent"
                  size={24}
                  className="pointer-events-none"
                />
                {selected ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3.5 text-white drop-shadow"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            aria-label={t("schedule.colorPicker.custom")}
            aria-expanded={showCustom}
            className={cn(
              "relative flex size-7 flex-none items-center justify-center rounded-full p-0.5 transition-[box-shadow,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              (showCustom || isCustom) && "ring-2 ring-ring",
            )}
          >
            <span
              className="flex size-6 items-center justify-center rounded-full"
              style={{
                background:
                  "conic-gradient(from 180deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
              }}
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5 text-white drop-shadow"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {showCustom ? (
        <div className="day-color-picker flex flex-col gap-2">
          <HexColorPicker color={normalizedValue} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span
              className="size-5 rounded-md border border-border shadow-xs"
              style={{ background: normalizedValue }}
              aria-hidden="true"
            />
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {normalizedValue}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface DayColorPickerProps extends DayColorPickerContentProps {
  trigger: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function DayColorPicker({
  trigger,
  value,
  onChange,
  presets,
  side = "bottom",
  align = "start",
}: DayColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverPopup side={side} align={align}>
        <DayColorPickerContent
          value={value}
          onChange={onChange}
          presets={presets}
        />
        <PopoverClose className="sr-only">Close</PopoverClose>
      </PopoverPopup>
    </Popover>
  );
}

function normalizeHex(color: string): string {
  const trimmed = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed || "#3f6fc9";
}
