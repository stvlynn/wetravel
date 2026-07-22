import { useTranslation } from "react-i18next";
import { Reveal } from "./Reveal";

function Sep() {
  return (
    <span aria-hidden className="text-border">
      ·
    </span>
  );
}

/** Slim factual band drawn from the seeded Japan · Autumn trip — texture
 * without fabricated metrics. */
export function FactsStrip() {
  const { t } = useTranslation("landing");
  return (
    <Reveal
      as="section"
      className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 text-sm text-muted-foreground"
    >
      <span className="font-medium text-foreground">{t("facts.label")}</span>
      <Sep />
      <span className="tabular-nums">{t("facts.days")}</span>
      <Sep />
      <span className="tabular-nums">{t("facts.stops")}</span>
      <Sep />
      <span>{t("facts.route")}</span>
    </Reveal>
  );
}
