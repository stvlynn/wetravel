import type { TripMember } from "@/entities/member";
import { Avatar } from "@/shared/ui/avatar";
import { InviteDialog } from "./InviteDialog";

export function FloatingMembers({
  tripId,
  members,
  canInvite,
}: {
  tripId: string;
  members: TripMember[];
  canInvite: boolean;
}) {
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2.5">
      <div className="pointer-events-auto flex items-center">
        {members.map((m, i) => (
          <Avatar
            key={m.id}
            name={m.name}
            bg={m.avatarBg}
            fg={m.avatarFg}
            src={m.image}
            seed={m.id}
            size={30}
            stackIndex={i}
          />
        ))}
      </div>
      {canInvite ? <InviteDialog tripId={tripId} /> : null}
    </div>
  );
}
