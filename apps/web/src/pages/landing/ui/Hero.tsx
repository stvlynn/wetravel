import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { BrowserFrame } from "./DeviceFrames";
import heroShot from "../assets/pc-map.jpg";

function scrollToFeatures() {
  const target = document.getElementById("features");
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  const { t } = useTranslation("landing");

  return (
    <section className="relative overflow-hidden">
      {/* Soft cornflower wash behind the fold — token-driven, theme-aware. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_60%_at_50%_-5%,var(--brand-muted),transparent_70%)]"
      />

      <div className="mx-auto max-w-6xl px-5 pt-16 pb-12 sm:pt-24">
        <div className="wf-enter-stagger mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="wf-enter inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-border)]">
            <span className="size-1.5 rounded-full bg-brand" />
            {t("hero.badge")}
          </span>

          <h1 className="wf-enter mt-5 text-4xl font-semibold tracking-[-0.02em] text-balance sm:text-5xl">
            {t("hero.titleLead")}{" "}
            <span className="text-brand">{t("hero.titleHighlight")}</span>
          </h1>

          <p className="wf-enter mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            {t("hero.subtitle")}
          </p>

          <div className="wf-enter mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={onGetStarted}>
              {t("hero.primary")}
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToFeatures}>
              {t("hero.secondary")}
            </Button>
          </div>

          <p className="wf-enter mt-6 text-xs text-muted-foreground">
            {t("hero.trust")}
          </p>
        </div>

        <div className="wf-enter mx-auto mt-14 max-w-5xl">
          <BrowserFrame src={heroShot} alt={t("hero.imageAlt")} priority />
        </div>
      </div>
    </section>
  );
}
