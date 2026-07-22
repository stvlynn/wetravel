import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  authClient,
  requestEmailBinding,
  useSession,
  verifyEmailBinding,
} from "@/shared/auth";
import { toastManager } from "@/shared/ui/toast";

/** Second-level security views reachable from the profile pane. */
export type SecurityView = "email" | "password" | "twoFactor";

export type EmailStep = "newEmail" | "currentOtp" | "newOtp";
export type TwoFactorEnableStep = "password" | "scan" | "backup";
export type CredentialState = "unknown" | "absent" | "present";
export type EmailState =
  | { kind: "unbound"; address: null; verified: false }
  | { kind: "bound"; address: string; verified: boolean };

export function resolveEmailState(user?: {
  email?: string | null;
  emailVerified?: boolean | null;
  emailIsPlaceholder?: boolean | null;
}): EmailState {
  return user?.emailIsPlaceholder
    ? { kind: "unbound", address: null, verified: false }
    : {
        kind: "bound",
        address: user?.email ?? "",
        verified: Boolean(user?.emailVerified),
      };
}

const OTP_LENGTH = 6;

/** Read-only account security status for the profile list rows. */
export function useAccountSecurityStatus() {
  const { data: session, refetch } = useSession();
  const user = session?.user;
  const [credentialState, setCredentialState] =
    useState<CredentialState>("unknown");

  const refreshCredential = useCallback(async () => {
    const result = await authClient.listAccounts();
    if (result.error || !result.data) {
      setCredentialState("unknown");
      return;
    }
    setCredentialState(
      result.data.some((account) => account.providerId === "credential")
        ? "present"
        : "absent",
    );
  }, []);

  useEffect(() => {
    void refreshCredential();
  }, [refreshCredential, user?.id]);

  const emailState = resolveEmailState(user);

  return {
    email: emailState.address ?? "",
    emailVerified: emailState.verified,
    emailState,
    twoFactorEnabled: Boolean(
      (user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
    ),
    credentialState,
    hasCredential: credentialState === "present",
    refetch,
    refreshCredential,
  };
}

/** Drives the security detail flows. Terminal successes call `onClose` so the
 * dialog can pop back to the account & security list. */
export function useAccountSecurity({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("common");
  const {
    email,
    emailVerified,
    emailState,
    twoFactorEnabled,
    hasCredential,
    credentialState,
    refetch,
    refreshCredential,
  } = useAccountSecurityStatus();

  const [pending, setPending] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("newEmail");
  const [currentEmailOtp, setCurrentEmailOtp] = useState("");
  const [newEmailOtp, setNewEmailOtp] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupOtp, setSetupOtp] = useState("");

  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorEnableStep, setTwoFactorEnableStep] =
    useState<TwoFactorEnableStep>("password");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  const notifyError = useCallback(
    (description: string) => {
      toastManager.add({
        title: t("settings.profile.security.errorTitle"),
        description,
        type: "error",
      });
    },
    [t],
  );

  const notifySuccess = useCallback(
    (description: string) => {
      toastManager.add({
        title: t("settings.profile.security.successTitle"),
        description,
        type: "success",
      });
    },
    [t],
  );

  const sendCurrentEmailOtp = useCallback(async () => {
    if (!email) return false;
    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (result.error) {
      notifyError(t("settings.profile.security.errors.otpSend"));
      return false;
    }
    return true;
  }, [email, notifyError, t]);

  const startEmailChange = useCallback(async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      notifyError(t("settings.profile.security.errors.emailInvalid"));
      return;
    }
    if (trimmed === email.toLowerCase()) {
      notifyError(t("settings.profile.security.errors.emailSame"));
      return;
    }

    setPending(true);
    try {
      if (emailState.kind === "unbound") {
        const result = await requestEmailBinding(trimmed);
        if (result.error) {
          notifyError(t("settings.profile.security.errors.otpSend"));
          return;
        }
        setEmailStep("newOtp");
        notifySuccess(t("settings.profile.security.email.otpSentNew"));
      } else {
        const sent = await sendCurrentEmailOtp();
        if (!sent) return;
        setEmailStep("currentOtp");
        notifySuccess(t("settings.profile.security.email.otpSentCurrent"));
      }
    } finally {
      setPending(false);
    }
  }, [
    email,
    emailState.kind,
    newEmail,
    notifyError,
    notifySuccess,
    sendCurrentEmailOtp,
    t,
  ]);

  const confirmCurrentEmailOtp = useCallback(async () => {
    if (currentEmailOtp.length !== OTP_LENGTH) return;

    setPending(true);
    try {
      const result = await authClient.emailOtp.requestEmailChange({
        newEmail: newEmail.trim().toLowerCase(),
        otp: currentEmailOtp,
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.otpInvalid"));
        setCurrentEmailOtp("");
        return;
      }
      setEmailStep("newOtp");
      notifySuccess(t("settings.profile.security.email.otpSentNew"));
    } finally {
      setPending(false);
    }
  }, [currentEmailOtp, newEmail, notifyError, notifySuccess, t]);

  const confirmNewEmailOtp = useCallback(async () => {
    if (newEmailOtp.length !== OTP_LENGTH) return;

    setPending(true);
    try {
      const normalizedEmail = newEmail.trim().toLowerCase();
      const result =
        emailState.kind === "unbound"
          ? await verifyEmailBinding(normalizedEmail, newEmailOtp)
          : await authClient.emailOtp.changeEmail({
              newEmail: normalizedEmail,
              otp: newEmailOtp,
            });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.otpInvalid"));
        setNewEmailOtp("");
        return;
      }
      await refetch();
      notifySuccess(t("settings.profile.security.email.changed"));
      onClose();
    } finally {
      setPending(false);
    }
  }, [
    emailState.kind,
    newEmail,
    newEmailOtp,
    notifyError,
    notifySuccess,
    onClose,
    refetch,
    t,
  ]);

  const changePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      notifyError(t("settings.profile.security.errors.passwordRequired"));
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError(t("settings.profile.security.errors.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      notifyError(t("settings.profile.security.errors.passwordTooShort"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.passwordChangeFailed"));
        return;
      }
      notifySuccess(t("settings.profile.security.password.changed"));
      onClose();
    } finally {
      setPending(false);
    }
  }, [
    confirmPassword,
    currentPassword,
    newPassword,
    notifyError,
    notifySuccess,
    onClose,
    t,
  ]);

  const sendSetupPasswordOtp = useCallback(async () => {
    if (emailState.kind === "unbound") {
      notifyError(t("settings.profile.security.errors.emailRequired"));
      return;
    }
    if (!email) return;
    setPending(true);
    try {
      const result = await authClient.emailOtp.requestPasswordReset({ email });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.otpSend"));
        return;
      }
      notifySuccess(t("settings.profile.security.password.setupOtpSent"));
    } finally {
      setPending(false);
    }
  }, [email, emailState.kind, notifyError, notifySuccess, t]);

  const completeSetupPassword = useCallback(async () => {
    if (setupOtp.length !== OTP_LENGTH) return;
    if (newPassword !== confirmPassword) {
      notifyError(t("settings.profile.security.errors.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      notifyError(t("settings.profile.security.errors.passwordTooShort"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp: setupOtp,
        password: newPassword,
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.passwordSetupFailed"));
        return;
      }
      await refreshCredential();
      notifySuccess(t("settings.profile.security.password.setupDone"));
      onClose();
    } finally {
      setPending(false);
    }
  }, [
    confirmPassword,
    email,
    newPassword,
    notifyError,
    notifySuccess,
    onClose,
    refreshCredential,
    setupOtp,
    t,
  ]);

  const startTwoFactorEnable = useCallback(async () => {
    if (hasCredential && !twoFactorPassword) {
      notifyError(t("settings.profile.security.errors.passwordRequired"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.enable({
        password: hasCredential ? twoFactorPassword : undefined,
        issuer: "OpenTrip",
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.twoFactorEnableFailed"));
        return;
      }
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
      setTwoFactorEnableStep("scan");
    } finally {
      setPending(false);
    }
  }, [hasCredential, notifyError, t, twoFactorPassword]);

  const verifyTwoFactorEnable = useCallback(async () => {
    if (totpCode.trim().length < 6) return;

    setPending(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: totpCode.trim(),
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.otpInvalid"));
        setTotpCode("");
        return;
      }
      await refetch();
      setTwoFactorEnableStep("backup");
      notifySuccess(t("settings.profile.security.twoFactor.enabled"));
    } finally {
      setPending(false);
    }
  }, [notifyError, notifySuccess, refetch, t, totpCode]);

  const disableTwoFactor = useCallback(async () => {
    if (hasCredential && !disablePassword) {
      notifyError(t("settings.profile.security.errors.passwordRequired"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.disable({
        password: hasCredential ? disablePassword : undefined,
      });
      if (result.error) {
        notifyError(
          t("settings.profile.security.errors.twoFactorDisableFailed"),
        );
        return;
      }
      await refetch();
      notifySuccess(t("settings.profile.security.twoFactor.disabled"));
      onClose();
    } finally {
      setPending(false);
    }
  }, [
    disablePassword,
    hasCredential,
    notifyError,
    notifySuccess,
    onClose,
    refetch,
    t,
  ]);

  const regenerateBackupCodes = useCallback(async () => {
    if (hasCredential && !disablePassword) {
      notifyError(t("settings.profile.security.errors.passwordRequired"));
      return;
    }

    setPending(true);
    try {
      const result = await authClient.twoFactor.generateBackupCodes({
        password: hasCredential ? disablePassword : undefined,
      });
      if (result.error) {
        notifyError(t("settings.profile.security.errors.backupCodesFailed"));
        return;
      }
      setBackupCodes(result.data.backupCodes);
      notifySuccess(t("settings.profile.security.twoFactor.backupRegenerated"));
    } finally {
      setPending(false);
    }
  }, [disablePassword, hasCredential, notifyError, notifySuccess, t]);

  return {
    email,
    emailVerified,
    emailState,
    twoFactorEnabled,
    hasCredential,
    credentialState,
    pending,
    otpLength: OTP_LENGTH,

    newEmail,
    setNewEmail,
    emailStep,
    currentEmailOtp,
    setCurrentEmailOtp,
    newEmailOtp,
    setNewEmailOtp,
    startEmailChange,
    confirmCurrentEmailOtp,
    confirmNewEmailOtp,

    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    setupOtp,
    setSetupOtp,
    changePassword,
    sendSetupPasswordOtp,
    completeSetupPassword,

    twoFactorPassword,
    setTwoFactorPassword,
    twoFactorEnableStep,
    totpUri,
    backupCodes,
    totpCode,
    setTotpCode,
    disablePassword,
    setDisablePassword,
    startTwoFactorEnable,
    verifyTwoFactorEnable,
    disableTwoFactor,
    regenerateBackupCodes,
  };
}
