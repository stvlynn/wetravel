import { useTranslation } from "react-i18next";
import { agentAvatarUrl } from "@/shared/lib";
import { cn } from "@/shared/lib";

/** The AI agent's avatar: a vercel-style gradient with an extra dither layer,
 * generated from a fixed seed so it is identical across every trip and stays
 * static (no re-generation) once rendered. */
export function AgentAvatar({ className }: { className?: string }) {
  const { t } = useTranslation("agent");
  return (
    <img
      src={agentAvatarUrl()}
      alt={t("panel.agentName")}
      draggable={false}
      className={cn("size-6 shrink-0 rounded-full object-cover", className)}
    />
  );
}
