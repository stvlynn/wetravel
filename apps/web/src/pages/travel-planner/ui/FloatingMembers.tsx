import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TripMember } from "@/entities/member";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib";

export function FloatingMembers({ members }: { members: TripMember[] }) {
  const { t } = useTranslation("common");
  const [copied, setCopied] = useState(false);

  const invite = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2.5">
      <div className="pointer-events-auto flex items-center">
        {members.map((m, i) => (
          <Avatar
            key={m.id}
            initials={m.initials}
            name={m.name}
            bg={m.avatarBg}
            fg={m.avatarFg}
            size={30}
            stackIndex={i}
            online={i < 2}
          />
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="pointer-events-auto"
        onClick={invite}
      >
        <span
          className="wf-icon-swap inline-flex items-center gap-1.5"
          data-state={copied ? "active" : undefined}
        >
          <span className="inline-flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {t("actions.invite")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {t("actions.inviteCopied")}
          </span>
        </span>
      </Button>
    </div>
  );
}
