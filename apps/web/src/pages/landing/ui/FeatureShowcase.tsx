import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib";
import { FEATURES, type Feature } from "../lib/content";
import { BrowserFrame } from "./DeviceFrames";
import { Reveal } from "./Reveal";

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const { t } = useTranslation("landing");
  const Icon = feature.icon;
  const reverse = index % 2 === 1;
  const base = `features.${feature.id}` as const;

  return (
    <Reveal className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className={cn(reverse && "md:order-2")}>
        <BrowserFrame src={feature.image} alt={t(`${base}.imageAlt`)} />
      </div>
      <div className={cn("max-w-md", reverse ? "md:order-1" : "md:justify-self-end")}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-muted text-brand">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {t(`${base}.kicker`)}
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-balance sm:text-3xl">
          {t(`${base}.title`)}
        </h2>
        <p className="mt-3 text-base text-pretty text-muted-foreground">
          {t(`${base}.body`)}
        </p>
      </div>
    </Reveal>
  );
}

export function FeatureShowcase() {
  const { t } = useTranslation("landing");
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5">
      <div className="mt-12 flex flex-col gap-20 sm:gap-28">
        {FEATURES.map((feature, index) => (
          <FeatureRow key={feature.id} feature={feature} index={index} />
        ))}
      </div>
    </section>
  );
}
