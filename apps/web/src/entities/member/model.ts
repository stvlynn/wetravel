/** Collaboration role of a trip member. Owners always have full control. */
export type MemberRole = "owner" | "editor" | "viewer";

export interface TripMember {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  image?: string | null;
  /** Better Auth user id backing this membership. Null for legacy/demo members. */
  userId?: string | null;
  role: MemberRole;
  canInvite: boolean;
  isCurrentUser: boolean;
}
