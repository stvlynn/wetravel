import { Bot, CalendarDays, Map, MessageSquare, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import mapShot from "../assets/pc-map.jpg";
import scheduleShot from "../assets/pc-schedule.jpg";
import budgetShot from "../assets/pc-budget.jpg";
import agentShot from "../assets/pc-agent.jpg";
import stopDetailShot from "../assets/pc-stop-detail.jpg";

/** Intrinsic size of the desktop captures — set on every <img> so the reserved
 * space matches the image and nothing shifts as sections reveal. */
export const SHOT_WIDTH = 1440;
export const SHOT_HEIGHT = 900;

export interface Feature {
  /** i18n key stem under `features.*`. */
  id: "map" | "schedule" | "budget" | "agent" | "collaborate";
  icon: LucideIcon;
  image: string;
}

/** Feature rows, in scroll order. The showcase alternates the image side. */
export const FEATURES: Feature[] = [
  { id: "map", icon: Map, image: mapShot },
  { id: "schedule", icon: CalendarDays, image: scheduleShot },
  { id: "budget", icon: Wallet, image: budgetShot },
  { id: "agent", icon: Bot, image: agentShot },
  { id: "collaborate", icon: MessageSquare, image: stopDetailShot },
];
