import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  OTPField,
  OTPFieldInput,
  OTPFieldSeparator,
} from "@/shared/ui/otp-field";
import { ScrambleText } from "@/shared/ui/scramble-text";
import {
  useAccountSecurity,
  type SecurityView,
} from "../model/use-account-security";

type Security = ReturnType<typeof useAccountSecurity>;

/** Second-level security view rendered in place of the profile pane. */
export function AccountSecurityDetail({
  view,
  onDone,
}: {
  view: SecurityView;
  onDone: () => void;
}): React.ReactElement {
  const security = useAccountSecurity({ onClose: onDone });

  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      {view === "email" ? <EmailPanel security={security} /> : null}
      {view === "password" ? <PasswordPanel security={security} /> : null}
      {view === "twoFactor" ? <TwoFactorPanel security={security} /> : null}
    </div>
  );
}

function EmailPanel({ security }: { security: Security }): React.ReactElement {
  const { t } = useTranslation("common");
  const {
    emailStep,
    emailState,
    newEmail,
    setNewEmail,
    currentEmailOtp,
    setCurrentEmailOtp,
    newEmailOtp,
    setNewEmailOtp,
    pending,
    otpLength,
    startEmailChange,
    confirmCurrentEmailOtp,
    confirmNewEmailOtp,
  } = security;

  if (emailStep === "currentOtp") {
    return (
      <OtpBlock
        label={t("settings.profile.security.email.currentOtpLabel")}
        value={currentEmailOtp}
        onChange={setCurrentEmailOtp}
        length={otpLength}
        pending={pending}
        onSubmit={() => void confirmCurrentEmailOtp()}
        submitLabel={t("settings.profile.security.email.verifyCurrent")}
      />
    );
  }

  if (emailStep === "newOtp") {
    return (
      <OtpBlock
        label={t("settings.profile.security.email.newOtpLabel")}
        value={newEmailOtp}
        onChange={setNewEmailOtp}
        length={otpLength}
        pending={pending}
        onSubmit={() => void confirmNewEmailOtp()}
        submitLabel={t("settings.profile.security.email.confirm")}
      />
    );
  }

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">
          {emailState.kind === "unbound"
            ? t("settings.profile.security.email.bindLabel")
            : t("settings.profile.security.email.newLabel")}
        </span>
        <Input
          type="email"
          value={newEmail}
          autoComplete="email"
          onChange={(e) => setNewEmail(e.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={pending || !newEmail.trim()}
        className="self-start active:scale-[0.96]"
        onClick={() => void startEmailChange()}
      >
        {emailState.kind === "unbound"
          ? t("settings.profile.security.email.bind")
          : t("settings.profile.security.email.continue")}
      </Button>
    </>
  );
}

function PasswordPanel({
  security,
}: {
  security: Security;
}): React.ReactElement {
  const { t } = useTranslation("common");
  const {
    hasCredential,
    credentialState,
    emailState,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    setupOtp,
    setSetupOtp,
    pending,
    otpLength,
    changePassword,
    sendSetupPasswordOtp,
    completeSetupPassword,
  } = security;

  if (credentialState === "unknown") {
    return (
      <p className="text-xs text-pretty text-muted-foreground">
        {t("settings.profile.security.password.loadFailed")}
      </p>
    );
  }

  if (!hasCredential) {
    if (emailState.kind === "unbound") {
      return (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("settings.profile.security.password.bindEmailFirst")}
        </p>
      );
    }
    return (
      <>
        <p className="text-xs text-pretty text-muted-foreground">
          {t("settings.profile.security.password.setupHint")}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          className="self-start active:scale-[0.96]"
          onClick={() => void sendSetupPasswordOtp()}
        >
          {t("settings.profile.security.password.sendSetupOtp")}
        </Button>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {t("settings.profile.security.password.new")}
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {t("settings.profile.security.password.confirm")}
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <OtpBlock
          label={t("settings.profile.security.password.setupOtpLabel")}
          value={setupOtp}
          onChange={setSetupOtp}
          length={otpLength}
          pending={pending}
          onSubmit={() => void completeSetupPassword()}
          submitLabel={t("settings.profile.security.password.setupSubmit")}
        />
      </>
    );
  }

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          {t("settings.profile.security.password.current")}
        </span>
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          {t("settings.profile.security.password.new")}
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          {t("settings.profile.security.password.confirm")}
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={pending}
        className="self-start active:scale-[0.96]"
        onClick={() => void changePassword()}
      >
        {t("settings.profile.security.password.submit")}
      </Button>
    </>
  );
}

function TwoFactorPanel({
  security,
}: {
  security: Security;
}): React.ReactElement {
  if (security.twoFactorEnabled) {
    return <TwoFactorManage security={security} />;
  }
  return <TwoFactorEnable security={security} />;
}

function TwoFactorEnable({
  security,
}: {
  security: Security;
}): React.ReactElement {
  const { t } = useTranslation("common");
  const {
    hasCredential,
    credentialState,
    twoFactorEnableStep,
    twoFactorPassword,
    setTwoFactorPassword,
    totpUri,
    backupCodes,
    totpCode,
    setTotpCode,
    pending,
    startTwoFactorEnable,
    verifyTwoFactorEnable,
  } = security;

  if (credentialState === "unknown") {
    return (
      <p className="text-xs text-pretty text-muted-foreground">
        {t("settings.profile.security.password.loadFailed")}
      </p>
    );
  }

  const secret = totpUri ? totpSecretFromUri(totpUri) : null;

  if (twoFactorEnableStep === "scan" && totpUri) {
    return (
      <>
        <p className="text-xs text-pretty text-muted-foreground">
          {t("settings.profile.security.twoFactor.scanHint")}
        </p>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start">
          <TotpQr uri={totpUri} />
          {secret ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("settings.profile.security.twoFactor.manualSecret")}
              </span>
              <div className="flex min-w-0 items-center rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm text-foreground">
                <ScrambleText key={secret} className="break-all">
                  {secret}
                </ScrambleText>
              </div>
            </div>
          ) : null}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {t("settings.profile.security.twoFactor.codeLabel")}
          </span>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            className="tabular-nums"
          />
        </label>
        <Button
          type="button"
          disabled={pending || totpCode.trim().length < 6}
          className="self-start active:scale-[0.96]"
          onClick={() => void verifyTwoFactorEnable()}
        >
          {t("settings.profile.security.twoFactor.verify")}
        </Button>
      </>
    );
  }

  if (twoFactorEnableStep === "backup") {
    return (
      <>
        <p className="text-xs text-pretty text-muted-foreground">
          {t("settings.profile.security.twoFactor.backupHint")}
        </p>
        <BackupCodeGrid codes={backupCodes} />
      </>
    );
  }

  return (
    <>
      <p className="text-xs text-pretty text-muted-foreground">
        {t("settings.profile.security.twoFactor.enableHint")}
      </p>
      {hasCredential ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {t("settings.profile.security.password.current")}
          </span>
          <Input
            type="password"
            autoComplete="current-password"
            value={twoFactorPassword}
            onChange={(e) => setTwoFactorPassword(e.target.value)}
          />
        </label>
      ) : null}
      <Button
        type="button"
        disabled={pending || (hasCredential && !twoFactorPassword)}
        className="self-start active:scale-[0.96]"
        onClick={() => void startTwoFactorEnable()}
      >
        {t("settings.profile.security.twoFactor.continue")}
      </Button>
    </>
  );
}

function TwoFactorManage({
  security,
}: {
  security: Security;
}): React.ReactElement {
  const { t } = useTranslation("common");
  const {
    hasCredential,
    credentialState,
    disablePassword,
    setDisablePassword,
    backupCodes,
    pending,
    disableTwoFactor,
    regenerateBackupCodes,
  } = security;

  if (credentialState === "unknown") {
    return (
      <p className="text-xs text-pretty text-muted-foreground">
        {t("settings.profile.security.password.loadFailed")}
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-pretty text-muted-foreground">
        {t("settings.profile.security.twoFactor.manageHint")}
      </p>
      {hasCredential ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {t("settings.profile.security.password.current")}
          </span>
          <Input
            type="password"
            autoComplete="current-password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending || (hasCredential && !disablePassword)}
          className="active:scale-[0.96]"
          onClick={() => void regenerateBackupCodes()}
        >
          {t("settings.profile.security.twoFactor.regenerateBackup")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending || (hasCredential && !disablePassword)}
          className="active:scale-[0.96]"
          onClick={() => void disableTwoFactor()}
        >
          {t("settings.profile.security.twoFactor.disable")}
        </Button>
      </div>
      {backupCodes.length > 0 ? <BackupCodeGrid codes={backupCodes} /> : null}
    </>
  );
}

function BackupCodeGrid({ codes }: { codes: string[] }): React.ReactElement {
  return (
    <ul className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
      {codes.map((code) => (
        <li
          key={code}
          className="rounded-md border border-border bg-background px-2 py-1.5"
        >
          {code}
        </li>
      ))}
    </ul>
  );
}

function OtpBlock({
  label,
  value,
  onChange,
  length,
  pending,
  onSubmit,
  submitLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length: number;
  pending: boolean;
  onSubmit: () => void;
  submitLabel: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium">{label}</span>
      <OTPField
        length={length}
        value={value}
        onValueChange={onChange}
        autoSubmit
        disabled={pending}
        aria-label={label}
      >
        <OTPFieldInput />
        <OTPFieldInput />
        <OTPFieldInput />
        <OTPFieldSeparator />
        <OTPFieldInput />
        <OTPFieldInput />
        <OTPFieldInput />
      </OTPField>
      <Button
        type="button"
        disabled={pending || value.length !== length}
        className="self-start active:scale-[0.96]"
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function totpSecretFromUri(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get("secret");
  } catch {
    return null;
  }
}

function TotpQr({ uri }: { uri: string }): React.ReactElement {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(uri, {
      width: 180,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!dataUrl) {
    return <div className="size-[180px] rounded-lg bg-muted" aria-hidden />;
  }

  return (
    <img
      src={dataUrl}
      alt=""
      width={180}
      height={180}
      className="rounded-lg"
    />
  );
}
