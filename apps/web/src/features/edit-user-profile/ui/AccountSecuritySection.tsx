import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, interactive } from "@/shared/lib";
import {
  useAccountSecurityStatus,
  type SecurityView,
} from "../model/use-account-security";

/** Account & security list shown in the profile pane. Each row drills into a
 * dedicated second-level view via `onOpen`. */
export function AccountSecuritySection({
  onOpen,
}: {
  onOpen: (view: SecurityView) => void;
}): React.ReactElement {
  const { t } = useTranslation("common");
  const { emailState, twoFactorEnabled, credentialState } =
    useAccountSecurityStatus();

  return (
    <section className="flex max-w-[520px] flex-col gap-4 border-t border-border pt-7">
      <header>
        <h2 className="m-0 text-balance text-base font-semibold text-foreground">
          {t("settings.profile.security.title")}
        </h2>
        <p className="mt-1 text-pretty text-xs text-muted-foreground">
          {t("settings.profile.security.description")}
        </p>
      </header>

      <div className="flex flex-col gap-1">
        <SecurityNavRow
          label={t("settings.profile.security.email.label")}
          value={
            emailState.kind === "unbound"
              ? t("settings.profile.security.email.unbound")
              : emailState.verified
                ? t("settings.profile.security.email.verified", {
                    email: emailState.address,
                  })
                : emailState.address
          }
          onClick={() => onOpen("email")}
        />
        <SecurityNavRow
          label={t("settings.profile.security.password.label")}
          value={
            credentialState === "unknown"
              ? t("settings.profile.security.password.unknown")
              : credentialState === "present"
                ? t("settings.profile.security.password.set")
                : t("settings.profile.security.password.unset")
          }
          onClick={() => onOpen("password")}
        />
        <SecurityNavRow
          label={t("settings.profile.security.twoFactor.label")}
          value={
            twoFactorEnabled
              ? t("settings.profile.security.twoFactor.on")
              : t("settings.profile.security.twoFactor.off")
          }
          onClick={() => onOpen("twoFactor")}
        />
      </div>
    </section>
  );
}

function SecurityNavRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center justify-between gap-4 rounded-lg px-3 py-2 text-left",
        "hover:bg-accent active:scale-[0.99]",
        interactive,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {value}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
}
