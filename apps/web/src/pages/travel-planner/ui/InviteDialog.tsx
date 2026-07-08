import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createTripInvite,
  regenerateTripInvite,
  type CreatedInvite,
  type CreateInviteInput,
  type InviteAccessScope,
  type InviteMemberRole,
} from "@/shared/api";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { ScrambleText } from "@/shared/ui/scramble-text";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { toastManager } from "@/shared/ui/toast";

const ACCESS_SCOPES: InviteAccessScope[] = ["anyone", "restricted_emails"];
const ROLES: InviteMemberRole[] = ["editor", "viewer"];

/** Parse a free-form list of emails separated by commas, spaces, or newlines. */
function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Convert a `datetime-local` value to an ISO string, or null when empty. */
function toIsoExpiry(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function InviteDialog({ tripId }: { tripId: string }) {
  const { t } = useTranslation("invite");
  const { t: tc } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const [accessScope, setAccessScope] = useState<InviteAccessScope>("anyone");
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<InviteMemberRole>("editor");
  const [canInvite, setCanInvite] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const [pending, setPending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setAccessScope("anyone");
    setEmails("");
    setRole("editor");
    setCanInvite(false);
    setExpiresAt("");
    setCreated(null);
    setCopied(false);
    setPending(false);
    setRegenerating(false);
  }

  function buildInput(): CreateInviteInput {
    return {
      accessScope,
      allowedEmails:
        accessScope === "restricted_emails" ? parseEmails(emails) : [],
      role,
      canInvite,
      expiresAt: toIsoExpiry(expiresAt),
    };
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied (e.g. insecure context); the manual field stays visible.
    }
  }

  async function submit() {
    setPending(true);
    try {
      const invite = await createTripInvite(tripId, buildInput());
      setCreated(invite);
      void copy(invite.url);
    } catch (err) {
      toastManager.add({
        title: t("dialog.errorTitle"),
        description:
          err instanceof ApiError ? err.message : t("dialog.errorGeneric"),
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  async function regenerate() {
    if (!created) return;
    setRegenerating(true);
    try {
      const invite = await regenerateTripInvite(
        tripId,
        created.token,
        buildInput(),
      );
      setCreated(invite);
      setCopied(false);
    } catch (err) {
      toastManager.add({
        title: t("dialog.regenerateErrorTitle"),
        description:
          err instanceof ApiError ? err.message : t("dialog.errorGeneric"),
        type: "error",
      });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="outline"
        size="sm"
        className="pointer-events-auto"
        onClick={() => setOpen(true)}
      >
        {tc("actions.invite")}
      </Button>

      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-200 data-[ending-style]:opacity-0" />
        <DialogViewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 md:p-6">
          <DialogPopup className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-foreground">
                {t("dialog.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("dialog.description")}
              </DialogDescription>
            </DialogHeader>

            <DialogPanel className="flex flex-col gap-4 py-2">
              <Field label={t("dialog.access.label")}>
                <Select
                  items={ACCESS_SCOPES.map((s) => ({
                    value: s,
                    label: t(`dialog.access.${s}`),
                  }))}
                  value={accessScope}
                  onValueChange={(v) => setAccessScope(v as InviteAccessScope)}
                >
                  <SelectTrigger aria-label={t("dialog.access.label")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {ACCESS_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`dialog.access.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>

              {accessScope === "restricted_emails" ? (
                <Field label={t("dialog.emails.label")} hint={t("dialog.emails.hint")}>
                  <Input
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    placeholder={t("dialog.emails.placeholder")}
                    autoComplete="off"
                  />
                </Field>
              ) : null}

              <Field label={t("dialog.role.label")}>
                <Select
                  items={ROLES.map((r) => ({
                    value: r,
                    label: t(`dialog.role.${r}`),
                  }))}
                  value={role}
                  onValueChange={(v) => setRole(v as InviteMemberRole)}
                >
                  <SelectTrigger aria-label={t("dialog.role.label")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`dialog.role.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>

              <Checkbox
                checked={canInvite}
                onCheckedChange={setCanInvite}
                label={t("dialog.canInvite")}
              />

              <Field label={t("dialog.expiry.label")} hint={t("dialog.expiry.hint")}>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Field>

              {created ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-10 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-input bg-card px-3 font-mono text-sm text-foreground">
                    <ScrambleText
                      key={created.token}
                      className="whitespace-nowrap"
                    >
                      {created.url}
                    </ScrambleText>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={regenerating}
                    aria-label={t("dialog.regenerate")}
                    title={t("dialog.regenerate")}
                    onClick={regenerate}
                  >
                    <RefreshCw
                      className={regenerating ? "size-4 animate-spin" : "size-4"}
                      aria-hidden="true"
                    />
                  </Button>
                </div>
              ) : null}
            </DialogPanel>

            <DialogFooter>
              {created ? (
                <Button variant="brand" size="md" onClick={() => copy(created.url)}>
                  {copied ? t("dialog.copied") : t("dialog.copy")}
                </Button>
              ) : (
                <Button variant="brand" size="md" disabled={pending} onClick={submit}>
                  {pending ? t("dialog.creating") : t("dialog.create")}
                </Button>
              )}
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint ? (
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
