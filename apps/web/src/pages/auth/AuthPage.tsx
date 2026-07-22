import { useTranslation } from "react-i18next";
import { AuthForm } from "@/features/auth";
import { useRouter } from "@/app/router";
import { useIsMiniappEmbedded } from "@/app/embedded-environment";
import { Card } from "@/shared/ui/card";
import { interactive } from "@/shared/lib";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";

export function AuthPage() {
  const { t } = useTranslation("common");
  const { navigate } = useRouter();
  const embedded = useIsMiniappEmbedded();
  return (
    <div className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between px-6 py-4">
        {embedded ? (
          <span className="font-heading text-lg font-semibold">
            {t("appName")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label={t("appName")}
            className={`-mx-2 rounded-lg px-2 py-1 font-heading text-lg font-semibold ${interactive}`}
          >
            {t("appName")}
          </button>
        )}
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <Card className="wf-enter p-6">
            <AuthForm />
          </Card>
          <p className="mt-4 text-center text-xs text-pretty text-muted-foreground">
            {t("tagline")}
          </p>
        </div>
      </main>
    </div>
  );
}
