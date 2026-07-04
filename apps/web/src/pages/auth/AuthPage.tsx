import { useTranslation } from "react-i18next";
import { AuthForm } from "@/features/auth";
import { Card } from "@/shared/ui/card";
import { LanguageSwitch } from "@/shared/i18n/LanguageSwitch";

export function AuthPage() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-heading text-lg font-semibold">
          {t("appName")}
        </span>
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
