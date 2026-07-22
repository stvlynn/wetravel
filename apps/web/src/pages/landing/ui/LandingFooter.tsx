import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import logo from "../assets/logo.png";

export function LandingFooter() {
  const { t } = useTranslation("landing");
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-10 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              width={24}
              height={24}
              alt=""
              className="rounded-md"
              style={{ outline: "none" }}
            />
            <span className="font-heading text-sm font-semibold">
              {t("appName", { ns: "common" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <LanguageSwitch />
          <p className="text-xs text-muted-foreground">{t("footer.license")}</p>
        </div>
      </div>
    </footer>
  );
}
