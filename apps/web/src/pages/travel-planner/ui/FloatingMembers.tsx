import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TripMember } from "@/entities/member";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";

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
        {copied ? t("actions.inviteCopied") : t("actions.invite")}
      </Button>
    </div>
  );
}
