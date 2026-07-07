import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthForm } from "@/features/auth";
import { useSession } from "@/shared/auth";
import { useRouter } from "@/app/router";
import {
  acceptTripInvite,
  previewTripInvite,
  ApiError,
  type InvitePreview,
} from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Spinner } from "@/shared/ui/spinner";
import { toastManager } from "@/shared/ui/toast";

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-heading text-lg font-semibold">{t("appName")}</span>
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

export function InvitePage({ token }: { token: string }) {
  const { t } = useTranslation("invite");
  const { data: session, isPending: sessionPending } = useSession();

  const preview = useQuery<InvitePreview, ApiError>({
    queryKey: ["invite", token],
    queryFn: () => previewTripInvite(token),
    retry: false,
  });

  if (sessionPending || preview.isPending) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-5" />
          {t("accept.loading")}
        </div>
      </Shell>
    );
  }

  if (preview.isError) {
    return (
      <Shell>
        <InviteMessage
          title={t("accept.invalidTitle")}
          body={t("accept.notFound")}
        />
      </Shell>
    );
  }

  const data = preview.data;

  if (!session) {
    return (
      <Shell>
        <Card className="wf-enter p-6">
          <p className="mb-4 text-sm text-pretty text-muted-foreground">
            {t("accept.signInPrompt", { trip: data.tripTitle })}
          </p>
          <AuthForm />
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <AcceptCard token={token} preview={data} />
    </Shell>
  );
}

function AcceptCard({
  token,
  preview,
}: {
  token: string;
  preview: InvitePreview;
}) {
  const { t } = useTranslation("invite");
  const { navigate } = useRouter();
  const qc = useQueryClient();

  const openTrip = (tripId: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.trips });
    navigate(`/trips/${tripId}`);
  };

  const accept = useMutation({
    mutationFn: () => acceptTripInvite(token),
    onSuccess: (result) => openTrip(result.tripId),
    onError: (err) => {
      toastManager.add({
        title: t("accept.errorTitle"),
        description:
          err instanceof ApiError ? err.message : t("accept.errorGeneric"),
        type: "error",
      });
    },
  });

  const blocked =
    preview.status === "expired"
      ? t("accept.expired")
      : preview.status === "revoked"
        ? t("accept.revoked")
        : preview.status === "email_restricted"
          ? t("accept.emailRestricted")
          : null;

  if (blocked && !preview.alreadyMember) {
    return (
      <InviteMessage title={t("accept.invalidTitle")} body={blocked} />
    );
  }

  const expiryLabel =
    preview.expiresAt != null
      ? t("accept.expiresAt", {
          date: new Date(preview.expiresAt).toLocaleString(),
        })
      : null;

  return (
    <Card className="wf-enter flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {t("accept.heading", { trip: preview.tripTitle })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("accept.invitedBy", { name: preview.inviterName })}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("accept.members", { count: preview.memberCount })}
      </p>

      <p className="text-sm text-foreground">
        {preview.role === "viewer"
          ? t("accept.roleViewer")
          : t("accept.roleEditor")}
      </p>

      {expiryLabel ? (
        <p className="text-xs text-muted-foreground tabular-nums">{expiryLabel}</p>
      ) : null}

      {preview.alreadyMember ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("accept.alreadyMember")}
          </p>
          <Button variant="brand" size="lg" onClick={() => openTrip(preview.tripId)}>
            {t("accept.open")}
          </Button>
        </>
      ) : (
        <Button
          variant="brand"
          size="lg"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? t("accept.joining") : t("accept.join")}
        </Button>
      )}
    </Card>
  );
}

function InviteMessage({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation("invite");
  const { navigate } = useRouter();
  return (
    <Card className="wf-enter flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{body}</p>
      </div>
      <Button variant="outline" size="lg" onClick={() => navigate("/")}>
        {t("accept.back")}
      </Button>
    </Card>
  );
}
