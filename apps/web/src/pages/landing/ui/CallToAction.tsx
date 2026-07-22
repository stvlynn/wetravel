import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Reveal } from "./Reveal";

export function CallToAction({ onGetStarted }: { onGetStarted: () => void }) {
  const { t } = useTranslation("landing");
  return (
    <section className="mx-auto max-w-6xl px-5">
      <Reveal className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_srgb,var(--corn-500)_28%,transparent),transparent_70%)]"
        />
        <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
          {t("cta.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-pretty text-primary-foreground/70">
          {t("cta.subtitle")}
        </p>
        <div className="mt-8 flex justify-center">
          <Button variant="brand" size="lg" onClick={onGetStarted}>
            {t("cta.button")}
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
