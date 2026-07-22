import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { cn } from "@/shared/lib";
import logo from "../assets/logo.png";

/** Tracks whether the page has scrolled past the hero fold, so the header can
 * fade in a backdrop only when content sits behind it. */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

export function LandingHeader({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation("landing");
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-200",
        scrolled
          ? "border-border bg-background/80 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
      style={{ top: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <a href="/" className="flex items-center gap-2" aria-label={t("appName", { ns: "common" })}>
          <img
            src={logo}
            width={28}
            height={28}
            alt=""
            className="rounded-md"
            style={{ outline: "none" }}
          />
          <span className="font-heading text-base font-semibold">
            {t("appName", { ns: "common" })}
          </span>
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <Button size="md" onClick={onSignIn}>
            {t("nav.signIn")}
          </Button>
        </div>
      </div>
    </header>
  );
}
