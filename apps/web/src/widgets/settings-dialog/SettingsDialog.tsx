import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  CircleUserRound,
  Info,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AccountSecurityDetail,
  AccountSecuritySection,
  ProfileForm,
  type SecurityView,
} from "@/features/edit-user-profile";
import { PermissionSettings } from "@/features/mobile-onboarding";
import { CurrencySelect } from "@/features/set-default-currency";
import { useSettings, type SettingsPane } from "@/features/settings";
import { ThemeModeSelect } from "@/features/toggle-theme";
import { config } from "@/shared/config";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { cn, interactive } from "@/shared/lib";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/shared/ui/dialog";

const NAV_ITEMS: Array<{ pane: SettingsPane; icon: LucideIcon; group: "personal" | "application" }> = [
  { pane: "profile", icon: CircleUserRound, group: "personal" },
  { pane: "preferences", icon: Settings2, group: "personal" },
  { pane: "about", icon: Info, group: "application" },
];

export function SettingsDialog(): React.ReactElement {
  const { t } = useTranslation("common");
  const { open, pane, setOpen, setPane } = useSettings();
  const [securityView, setSecurityView] = useState<SecurityView | null>(null);

  // Drill-in state is ephemeral: reset when the pane changes or dialog closes.
  useEffect(() => {
    setSecurityView(null);
  }, [pane]);
  useEffect(() => {
    if (!open) setSecurityView(null);
  }, [open]);

  const closeSecurity = () => setSecurityView(null);

  const title = securityView
    ? t(`settings.profile.security.${securityView}.title`)
    : t(`settings.${pane}.title`);
  const description = securityView
    ? t(`settings.profile.security.${securityView}.desc`)
    : t(`settings.${pane}.description`);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-200 data-[ending-style]:opacity-0" />
        <DialogViewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-0 md:p-6">
          <DialogPopup className="flex h-dvh w-full max-w-none flex-col overflow-hidden rounded-none bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 md:h-[560px] md:max-w-[860px] md:flex-row md:rounded-2xl md:border md:border-border md:pt-0 md:pb-0">
            <SettingsNavigation
              pane={pane}
              onSelect={setPane}
              backLabel={securityView ? t("settings.nav.profile") : null}
              onBack={closeSecurity}
            />

            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <DialogClose type="button" className={cn("absolute right-3 top-3 z-10 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground", interactive)}>
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">{t("actions.close")}</span>
              </DialogClose>

              <DialogPanel className="flex flex-col gap-7 py-6 pr-14">
                <header>
                  <DialogTitle className="m-0 text-balance text-xl font-semibold text-foreground">
                    {title}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </DialogDescription>
                </header>

                {pane === "profile" ? (
                  securityView ? (
                    <AccountSecurityDetail
                      view={securityView}
                      onDone={closeSecurity}
                    />
                  ) : (
                    <div className="flex flex-col gap-7">
                      <ProfileForm />
                      <AccountSecuritySection onOpen={setSecurityView} />
                    </div>
                  )
                ) : pane === "preferences" ? (
                  <PreferencesPane />
                ) : (
                  <AboutPane />
                )}
              </DialogPanel>
            </section>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

function SettingsNavigation({
  pane,
  onSelect,
  backLabel,
  onBack,
}: {
  pane: SettingsPane;
  onSelect: (pane: SettingsPane) => void;
  backLabel: string | null;
  onBack: () => void;
}): React.ReactElement {
  const { t } = useTranslation("common");
  return (
    <aside className="flex flex-none gap-2 overflow-x-auto border-b border-border bg-sidebar px-3 py-3 md:w-56 md:flex-col md:gap-6 md:overflow-visible md:border-b-0 md:px-3 md:py-5">
      {backLabel ? (
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "flex min-h-10 flex-none items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs font-semibold text-foreground hover:bg-accent md:w-full",
            interactive,
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {backLabel}
        </button>
      ) : null}
      {(["personal", "application"] as const).map((group) => (
        <div key={group} className="flex flex-none gap-1 md:block">
          <p className="hidden px-2 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground md:block">
            {t(`settings.groups.${group}`)}
          </p>
          {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
            <SettingsNavItem
              key={item.pane}
              active={pane === item.pane}
              icon={item.icon}
              label={t(`settings.nav.${item.pane}`)}
              onClick={() => onSelect(item.pane)}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}

function SettingsNavItem({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        `flex min-h-10 flex-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs ${interactive} md:w-full`,
        active
          ? "bg-card font-semibold text-foreground shadow-xs"
          : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function PreferencesPane(): React.ReactElement {
  const { t } = useTranslation("common");
  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      <SettingRow label={t("settings.language.label")}>
        <LanguageSwitch />
      </SettingRow>
      <SettingRow label={t("settings.appearance.label")}>
        <ThemeModeSelect />
      </SettingRow>
      <SettingRow label={t("settings.currency.label")}>
        <CurrencySelect />
      </SettingRow>
      <PermissionSettings />
    </div>
  );
}

function AboutPane(): React.ReactElement {
  const { t } = useTranslation("common");
  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 flex-none items-center justify-center rounded-2xl bg-brand font-heading text-xl font-bold text-brand-foreground">
          {t("appName")[0]}
        </div>
        <div>
          <p className="m-0 text-xs font-semibold text-foreground">{t("appName")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("settings.about.version", { version: config.version })}
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
