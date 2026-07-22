import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enTrips from "./locales/en/trips.json";
import enPlanner from "./locales/en/planner.json";
import enAuth from "./locales/en/auth.json";
import enInvite from "./locales/en/invite.json";
import enAgent from "./locales/en/agent.json";
import enLanding from "./locales/en/landing.json";
import zhCommon from "./locales/zh/common.json";
import zhTrips from "./locales/zh/trips.json";
import zhPlanner from "./locales/zh/planner.json";
import zhAuth from "./locales/zh/auth.json";
import zhInvite from "./locales/zh/invite.json";
import zhAgent from "./locales/zh/agent.json";
import zhLanding from "./locales/zh/landing.json";

export const resources = {
  en: { common: enCommon, trips: enTrips, planner: enPlanner, auth: enAuth, invite: enInvite, agent: enAgent, landing: enLanding },
  zh: { common: zhCommon, trips: zhTrips, planner: zhPlanner, auth: zhAuth, invite: zhInvite, agent: zhAgent, landing: zhLanding },
} as const;

export const supportedLanguages = ["en", "zh"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultNS = "common";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: supportedLanguages,
    defaultNS,
    ns: ["common", "trips", "planner", "auth", "invite", "agent", "landing"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "opentrip-lang",
    },
  });

export default i18n;
