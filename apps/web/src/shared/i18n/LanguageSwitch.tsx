import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { supportedLanguages, type SupportedLanguage } from "./index";

function resolveLanguage(raw: string | undefined): SupportedLanguage {
  const base = (raw ?? "en").split("-")[0];
  return supportedLanguages.includes(base as SupportedLanguage)
    ? (base as SupportedLanguage)
    : "en";
}

/** Compact select to switch UI language. Choice persists via the i18next
 * language detector (localStorage). */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("common");
  const active = resolveLanguage(i18n.resolvedLanguage ?? i18n.language);

  const items = supportedLanguages.map((lng) => ({
    value: lng,
    label: t(`languageName.${lng}` as const),
  }));

  return (
    <Select
      items={items}
      value={active}
      onValueChange={(next) => {
        if (!next || next === active) return;
        void i18n.changeLanguage(next);
      }}
    >
      <SelectTrigger
        className={cn("w-36", className)}
        aria-label={t("language")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {supportedLanguages.map((lng) => (
          <SelectItem key={lng} value={lng}>
            {t(`languageName.${lng}` as const)}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
