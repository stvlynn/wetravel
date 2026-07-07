import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Info,
  LogOut,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { signOut, useSession } from "@/shared/auth";
import { useSettings, type SettingsPane } from "@/features/settings";
import { Avatar } from "@/shared/ui/avatar";
import { IconSwap } from "@/shared/ui/icon-swap";
import { cn, interactive, avatarHashIndex, AVATAR_PALETTE } from "@/shared/lib";

export interface UserMenuProps {
  /** Compact top-bar trigger: just an avatar, no name/chevron. */
  compact?: boolean;
}

/** Sidebar footer: avatar trigger that opens an upward menu holding account
 * info, settings panes, and sign out. Mirrors Kalmia's UserMenu pattern. */
export function UserMenu({ compact }: UserMenuProps) {
  const { t } = useTranslation("common");
  const { data: session } = useSession();
  const { openPane } = useSettings();
  const [open, setOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

  useEffect(() => {
    if (open) {
      setRenderOpen(true);
      return;
    }
    const id = setTimeout(() => setRenderOpen(false), 200);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openSettings = (pane: SettingsPane) => {
    setOpen(false);
    openPane(pane);
  };

  const user = session?.user;
  const name = user?.name?.trim() || user?.email || "";
  const email = user?.email ?? "";
  const image = user?.image ?? null;
  const seed = user?.id ?? name;
  const color = AVATAR_PALETTE[avatarHashIndex(seed || "?", AVATAR_PALETTE.length)]!;

  return (
    <div ref={containerRef} className="relative z-10 flex-none p-2">
      {renderOpen && (
        <div
          role="menu"
          aria-hidden={!open}
          className={cn(
            "absolute bottom-full mb-2 flex flex-col rounded-xl bg-popover p-1 shadow-[var(--shadow-border),var(--shadow-lg)]",
            compact ? "right-0 w-64 origin-bottom-right" : "inset-x-2 origin-bottom",
            "transition-[opacity,translate,filter] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
            open
              ? "pointer-events-auto opacity-100 translate-y-0"
              : "pointer-events-none opacity-0 -translate-y-3 blur-sm",
          )}
        >
          <div className="wf-enter-stagger">
            <div className="wf-enter">
              <div className="flex items-center gap-2.5 px-2 py-2">
                <Avatar name={name} bg={color.bg} fg={color.fg} src={image} seed={seed} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {email && email !== name ? (
                    <p className="truncate text-xs text-muted-foreground">{email}</p>
                  ) : null}
                </div>
              </div>

              <div className="my-1 h-px bg-border" />
            </div>

            <div className="wf-enter">
              <MenuItem
                icon={CircleUserRound}
                label={t("settings.userMenu.profile")}
                onClick={() => openSettings("profile")}
              />
              <MenuItem
                icon={Settings2}
                label={t("settings.userMenu.preferences")}
                onClick={() => openSettings("preferences")}
              />
              <MenuItem
                icon={Info}
                label={t("settings.userMenu.about")}
                onClick={() => openSettings("about")}
              />

              <div className="my-1 h-px bg-border" />
            </div>

            <div className="wf-enter">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-lg pl-1.5 pr-2 py-2 text-left text-sm font-medium text-foreground hover:bg-accent",
                  interactive,
                )}
              >
                <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
                {t("actions.signOut")}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          interactive,
          compact
            ? "inline-flex size-[30px] items-center justify-center rounded-full"
            : "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left",
          open ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <Avatar
          name={name}
          bg={color.bg}
          fg={color.fg}
          src={image}
          seed={seed}
          size={compact ? 30 : 32}
          className={compact ? "ring-2 ring-card" : undefined}
        />
        {!compact && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              {email && email !== name ? (
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              ) : null}
            </div>
            <IconSwap
              className="size-4 flex-none text-muted-foreground"
              active={open}
              from={<ChevronDown className="size-4" />}
              to={<ChevronUp className="size-4" />}
            />
          </>
        )}
      </button>
    </div>
  );
}

const MenuItem = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={cn(
      "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-accent",
      interactive,
    )}
  >
    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
    <span className="flex-1">{label}</span>
  </button>
);
