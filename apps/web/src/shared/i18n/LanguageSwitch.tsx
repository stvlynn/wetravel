import { useTranslation } from "react-i18next";
import { cn, interactive } from "@/shared/lib";
import { supportedLanguages, type SupportedLanguage } from "./index";

/** Compact segmented control to switch UI language. Choice persists via the
 * i18next language detector (localStorage). */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("common");
  const active = (i18n.resolvedLanguage ?? "en") as SupportedLanguage;

  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-card p-0.5 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {supportedLanguages.map((lng) => {
        const selected = lng === active;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={selected}
            onClick={() => void i18n.changeLanguage(lng)}
            className={cn(
              `h-10 rounded-full px-3 text-xs font-medium ${interactive}`,
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`languageName.${lng}` as const)}
          </button>
        );
      })}
    </div>
  );
}
