import { useTranslation } from "react-i18next";
import { PhoneFrame } from "./DeviceFrames";
import { Reveal } from "./Reveal";
import mapShot from "../assets/pwa-map.jpg";
import scheduleShot from "../assets/pwa-schedule.jpg";
import agentShot from "../assets/pwa-agent.jpg";

export function MobileShowcase() {
  const { t } = useTranslation("landing");
  return (
    <section className="mx-auto max-w-6xl px-5">
      <Reveal className="grid items-center gap-12 md:grid-cols-2">
        <div className="max-w-md">
          <p className="text-sm font-medium text-brand">{t("mobile.overline")}</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-balance sm:text-3xl">
            {t("mobile.title")}
          </h2>
          <p className="mt-3 text-base text-pretty text-muted-foreground">
            {t("mobile.body")}
          </p>
        </div>

        <div className="flex items-end justify-center">
          <PhoneFrame
            src={mapShot}
            alt={t("mobile.mapAlt")}
            className="w-36 origin-bottom -rotate-6 sm:w-40"
          />
          <PhoneFrame
            src={scheduleShot}
            alt={t("mobile.scheduleAlt")}
            className="z-10 -mx-4 w-40 sm:w-44"
          />
          <PhoneFrame
            src={agentShot}
            alt={t("mobile.agentAlt")}
            className="w-36 origin-bottom rotate-6 sm:w-40"
          />
        </div>
      </Reveal>
    </section>
  );
}
