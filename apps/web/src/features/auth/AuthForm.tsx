import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  authClient,
  setTwoFactorRequiredHandler,
  signIn,
  signUp,
} from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  OTPField,
  OTPFieldInput,
  OTPFieldSeparator,
} from "@/shared/ui/otp-field";
import { toastManager } from "@/shared/ui/toast";
import { config } from "@/shared/config";
import { CaptchaField, type CaptchaFieldRef } from "./ui/CaptchaField";

type Mode = "signIn" | "signUp";
type Step =
  | "credentials"
  | "otp"
  | "twoFactor"
  | "forgotEmail"
  | "forgotReset";
type TwoFactorMethod = "totp" | "backup";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" {...props}>
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}

function isEmailNotVerified(error: { code?: string; message?: string } | null | undefined) {
    if (!error) return false;
    const code = error.code?.toUpperCase() ?? "";
    const message = error.message?.toLowerCase() ?? "";
    return (
        code === "EMAIL_NOT_VERIFIED" ||
        message.includes("email not verified") ||
        message.includes("email verification")
    );
}

function captchaHeaders(token: string | null): Record<string, string> {
    return { "x-captcha-response": token ?? "" };
}

const linkButtonClassName =
    "inline-flex min-h-10 items-center justify-center text-sm text-muted-foreground transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:text-foreground hover:underline active:scale-[var(--press-scale)]";

export function AuthForm() {
    const { t } = useTranslation("auth");
    const [mode, setMode] = useState<Mode>("signIn");
    const [step, setStep] = useState<Step>("credentials");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [twoFactorMethod, setTwoFactorMethod] =
        useState<TwoFactorMethod>("totp");
    const [pending, setPending] = useState(false);
    const [resendIn, setResendIn] = useState(0);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRef = useRef<CaptchaFieldRef>(null);
    const captchaEnabled =
        config.captchaProvider === "cloudflare-turnstile" &&
        !!config.turnstileSiteKey;

    const isSignUp = mode === "signUp";
    const ns = isSignUp ? "signUp" : "signIn";

    const enterTwoFactorStep = () => {
        setTwoFactorCode("");
        setTwoFactorMethod("totp");
        setStep("twoFactor");
        setPending(false);
        captchaRef.current?.reset();
    };

    useEffect(() => {
        setTwoFactorRequiredHandler(enterTwoFactorStep);
        return () => setTwoFactorRequiredHandler(null);
    }, []);

    useEffect(() => {
        if (resendIn <= 0) return;
        const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => window.clearTimeout(id);
    }, [resendIn]);

    function showAuthError(description?: string) {
        toastManager.add({
            title: t("errors.toastTitle"),
            description: description ?? t("errors.generic"),
            type: "error",
        });
    }

    function enterOtpStep() {
        setOtp("");
        setStep("otp");
        setResendIn(RESEND_COOLDOWN_SECONDS);
        captchaRef.current?.reset();
    }

    function enterForgotEmail() {
        setMode("signIn");
        setStep("forgotEmail");
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
        setResendIn(0);
        captchaRef.current?.reset();
    }

    function enterForgotReset() {
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
        setStep("forgotReset");
        setResendIn(RESEND_COOLDOWN_SECONDS);
    }

    async function sendOtp(options?: { announce?: boolean }) {
        if (captchaEnabled && !captchaToken) return false;

        const result = await authClient.emailOtp.sendVerificationOtp({
            email,
            type: "email-verification",
            fetchOptions: {
                headers: captchaHeaders(captchaToken),
            },
        });

        captchaRef.current?.reset();

        if (result.error) {
            showAuthError(t("errors.otpSend"));
            return false;
        }

        setResendIn(RESEND_COOLDOWN_SECONDS);
        if (options?.announce) {
            toastManager.add({
                title: t("otp.sent"),
                type: "success",
            });
        }
        return true;
    }

    async function sendForgotPasswordOtp(options?: { announce?: boolean }) {
        const result = await authClient.emailOtp.requestPasswordReset({
            email,
        });

        if (result.error) {
            showAuthError(t("errors.otpSend"));
            return false;
        }

        setResendIn(RESEND_COOLDOWN_SECONDS);
        if (options?.announce) {
            toastManager.add({
                title: t("otp.sent"),
                type: "success",
            });
        }
        return true;
    }

    async function submitCredentials(e: React.FormEvent) {
        e.preventDefault();
        if (captchaEnabled && !captchaToken) return;

        setPending(true);
        try {
            if (isSignUp) {
                const result = await signUp.email({
                    name,
                    email,
                    password,
                    fetchOptions: {
                        headers: captchaHeaders(captchaToken),
                    },
                });
                if (result.error) {
                    showAuthError();
                    captchaRef.current?.reset();
                    return;
                }
                // requireEmailVerification: account created, OTP emailed via
                // sendOnSignUp + overrideDefaultEmailVerification.
                enterOtpStep();
                return;
            }

            const result = await signIn.email({
                email,
                password,
                fetchOptions: {
                    headers: captchaHeaders(captchaToken),
                },
            });
            if (result.error) {
                if (isEmailNotVerified(result.error)) {
                    // sendOnSignIn already triggered an OTP; show the step.
                    enterOtpStep();
                    return;
                }
                showAuthError();
                captchaRef.current?.reset();
            }
        } catch {
            showAuthError();
            captchaRef.current?.reset();
        } finally {
            setPending(false);
        }
    }

    async function submitForgotEmail(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;

        setPending(true);
        try {
            const ok = await sendForgotPasswordOtp();
            if (ok) enterForgotReset();
        } finally {
            setPending(false);
        }
    }

    async function submitForgotReset(e: React.FormEvent) {
        e.preventDefault();
        if (otp.length !== OTP_LENGTH) return;
        if (newPassword !== confirmPassword) {
            showAuthError(t("errors.passwordMismatch"));
            return;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            showAuthError(t("errors.passwordTooShort"));
            return;
        }

        setPending(true);
        try {
            const result = await authClient.emailOtp.resetPassword({
                email,
                otp,
                password: newPassword,
            });
            if (result.error) {
                showAuthError(t("errors.passwordResetFailed"));
                setOtp("");
                return;
            }
            toastManager.add({
                title: t("forgotPassword.done"),
                type: "success",
            });
            setPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setOtp("");
            setStep("credentials");
            setMode("signIn");
            setResendIn(0);
        } catch {
            showAuthError(t("errors.passwordResetFailed"));
            setOtp("");
        } finally {
            setPending(false);
        }
    }

    async function resendForgotPasswordOtp() {
        if (resendIn > 0 || pending) return;
        setPending(true);
        try {
            await sendForgotPasswordOtp({ announce: true });
        } finally {
            setPending(false);
        }
    }

    async function submitOtp(e: React.FormEvent) {
        e.preventDefault();
        if (otp.length !== OTP_LENGTH) return;

        setPending(true);
        try {
            const result = await authClient.emailOtp.verifyEmail({
                email,
                otp,
            });
            if (result.error) {
                showAuthError(t("errors.otpInvalid"));
                setOtp("");
                return;
            }
            // autoSignInAfterVerification issues the session cookie; Gate
            // re-renders via useSession.
        } catch {
            showAuthError(t("errors.otpInvalid"));
            setOtp("");
        } finally {
            setPending(false);
        }
    }

    async function resendOtp() {
        if (resendIn > 0 || pending) return;
        if (captchaEnabled && !captchaToken) return;

        setPending(true);
        try {
            await sendOtp({ announce: true });
        } finally {
            setPending(false);
        }
    }

    async function signInWithGoogle() {
        setPending(true);
        try {
            // Better Auth defaults callbackURL to the API baseURL when omitted,
            // so Google would return users to api.opentrip.im (404). Preserve
            // the current SPA path (e.g. /invite/:token) so invite accept
            // continues after OAuth instead of dropping the user on "/".
            const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
            const result = await signIn.social({
                provider: "google",
                callbackURL: returnTo,
                errorCallbackURL: returnTo,
            });
            if (result.error) showAuthError();
        } catch {
            showAuthError();
        } finally {
            setPending(false);
        }
    }

    async function submitTwoFactor(e: React.FormEvent) {
        e.preventDefault();
        const code = twoFactorCode.trim();
        if (!code) return;

        setPending(true);
        try {
            const result =
                twoFactorMethod === "backup"
                    ? await authClient.twoFactor.verifyBackupCode({ code })
                    : await authClient.twoFactor.verifyTotp({ code });
            if (result.error) {
                showAuthError(t("errors.twoFactorInvalid"));
                setTwoFactorCode("");
                return;
            }
            // Session cookie is set; Gate re-renders via useSession.
        } catch {
            showAuthError(t("errors.twoFactorInvalid"));
            setTwoFactorCode("");
        } finally {
            setPending(false);
        }
    }

    function switchMode() {
        setMode(isSignUp ? "signIn" : "signUp");
        setStep("credentials");
        setOtp("");
        setTwoFactorCode("");
        setNewPassword("");
        setConfirmPassword("");
        setResendIn(0);
        captchaRef.current?.reset();
    }

    function backToCredentials() {
        setStep("credentials");
        setOtp("");
        setTwoFactorCode("");
        setNewPassword("");
        setConfirmPassword("");
        setResendIn(0);
        captchaRef.current?.reset();
    }

    if (step === "twoFactor") {
        return (
            <form
                onSubmit={submitTwoFactor}
                className="flex flex-col gap-4 wf-enter-stagger"
            >
                <div className="wf-enter flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
                        {t("twoFactor.title")}
                    </h1>
                    <p className="text-sm text-pretty text-muted-foreground">
                        {twoFactorMethod === "backup"
                            ? t("twoFactor.backupSubtitle")
                            : t("twoFactor.subtitle")}
                    </p>
                </div>

                <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
                    {twoFactorMethod === "backup"
                        ? t("twoFactor.backupLabel")
                        : t("twoFactor.label")}
                    <Input
                        type="text"
                        inputMode={
                            twoFactorMethod === "backup" ? "text" : "numeric"
                        }
                        autoComplete="one-time-code"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value)}
                        className="tabular-nums"
                        required
                    />
                </label>

                <div className="wf-enter flex flex-col gap-2">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={pending || !twoFactorCode.trim()}
                    >
                        {t("twoFactor.submit")}
                    </Button>
                    <button
                        type="button"
                        className={linkButtonClassName}
                        onClick={() => {
                            setTwoFactorMethod((m) =>
                                m === "totp" ? "backup" : "totp",
                            );
                            setTwoFactorCode("");
                        }}
                    >
                        {twoFactorMethod === "backup"
                            ? t("twoFactor.useApp")
                            : t("twoFactor.useBackup")}
                    </button>
                    <button
                        type="button"
                        className={linkButtonClassName}
                        onClick={backToCredentials}
                    >
                        {t("otp.back")}
                    </button>
                </div>
            </form>
        );
    }

    if (step === "forgotEmail") {
        return (
            <form
                onSubmit={submitForgotEmail}
                className="flex flex-col gap-4 wf-enter-stagger"
            >
                <div className="wf-enter flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
                        {t("forgotPassword.title")}
                    </h1>
                    <p className="text-sm text-pretty text-muted-foreground">
                        {t("forgotPassword.subtitle")}
                    </p>
                </div>

                <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
                    {t("forgotPassword.email")}
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />
                </label>

                <div className="wf-enter flex flex-col gap-2">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={pending || !email.trim()}
                    >
                        {t("forgotPassword.submit")}
                    </Button>
                    <button
                        type="button"
                        className={linkButtonClassName}
                        onClick={backToCredentials}
                    >
                        {t("forgotPassword.back")}
                    </button>
                </div>
            </form>
        );
    }

    if (step === "forgotReset") {
        return (
            <form
                onSubmit={submitForgotReset}
                className="flex flex-col gap-4 wf-enter-stagger"
            >
                <div className="wf-enter flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
                        {t("forgotPassword.otpTitle")}
                    </h1>
                    <p className="text-sm text-pretty text-muted-foreground">
                        {t("forgotPassword.otpSubtitle", { email })}
                    </p>
                </div>

                <div className="wf-enter flex flex-col gap-2">
                    <span className="text-sm font-medium">{t("otp.label")}</span>
                    <OTPField
                        length={OTP_LENGTH}
                        value={otp}
                        onValueChange={(value) => setOtp(value)}
                        disabled={pending}
                        aria-label={t("otp.label")}
                    >
                        <OTPFieldInput />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 2 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 3 })} />
                        <OTPFieldSeparator />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 4 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 5 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 6 })} />
                    </OTPField>
                </div>

                <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
                    {t("forgotPassword.newPassword")}
                    <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                    />
                </label>

                <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
                    {t("forgotPassword.confirmPassword")}
                    <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                    />
                </label>

                <div className="wf-enter flex flex-col gap-2">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={
                            pending ||
                            otp.length !== OTP_LENGTH ||
                            !newPassword ||
                            !confirmPassword
                        }
                    >
                        {t("forgotPassword.submitReset")}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        disabled={pending || resendIn > 0}
                        onClick={resendForgotPasswordOtp}
                    >
                        {resendIn > 0
                            ? t("otp.resendIn", { seconds: resendIn })
                            : t("otp.resend")}
                    </Button>
                    <button
                        type="button"
                        className={linkButtonClassName}
                        onClick={enterForgotEmail}
                    >
                        {t("forgotPassword.back")}
                    </button>
                </div>
            </form>
        );
    }

    if (step === "otp") {
        return (
            <form
                onSubmit={submitOtp}
                className="flex flex-col gap-4 wf-enter-stagger"
            >
                <div className="wf-enter flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
                        {t("otp.title")}
                    </h1>
                    <p className="text-sm text-pretty text-muted-foreground">
                        {t("otp.subtitle", { email })}
                    </p>
                </div>

                <div className="wf-enter flex flex-col gap-2">
                    <span className="text-sm font-medium">{t("otp.label")}</span>
                    <OTPField
                        length={OTP_LENGTH}
                        value={otp}
                        onValueChange={(value) => setOtp(value)}
                        autoSubmit
                        disabled={pending}
                        aria-label={t("otp.label")}
                    >
                        <OTPFieldInput />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 2 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 3 })} />
                        <OTPFieldSeparator />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 4 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 5 })} />
                        <OTPFieldInput aria-label={t("otp.slot", { n: 6 })} />
                    </OTPField>
                </div>

                <div className="wf-enter">
                    <CaptchaField
                        key="otp-resend"
                        ref={captchaRef}
                        onTokenChange={setCaptchaToken}
                    />
                </div>

                <div className="wf-enter flex flex-col gap-2">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={pending || otp.length !== OTP_LENGTH}
                    >
                        {t("otp.submit")}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        disabled={
                            pending ||
                            resendIn > 0 ||
                            (captchaEnabled && !captchaToken)
                        }
                        onClick={resendOtp}
                    >
                        {resendIn > 0
                            ? t("otp.resendIn", { seconds: resendIn })
                            : t("otp.resend")}
                    </Button>
                    <button
                        type="button"
                        className={linkButtonClassName}
                        onClick={backToCredentials}
                    >
                        {t("otp.back")}
                    </button>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={submitCredentials} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
                    {t(`${ns}.title`)}
                </h1>
                <p className="text-sm text-pretty text-muted-foreground">
                    {t(`${ns}.subtitle`)}
                </p>
            </div>

            {isSignUp ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {t("signUp.name")}
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        required
                    />
                </label>
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t(`${ns}.email`)}
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                />
            </label>

            <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                    <label
                        htmlFor="auth-password"
                        className="text-sm font-medium"
                    >
                        {t(`${ns}.password`)}
                    </label>
                    {!isSignUp ? (
                        <button
                            type="button"
                            className="shrink-0 text-sm text-muted-foreground transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:text-foreground hover:underline active:scale-[var(--press-scale)]"
                            onClick={enterForgotEmail}
                        >
                            {t("signIn.forgotPassword")}
                        </button>
                    ) : null}
                </div>
                <Input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                        isSignUp ? "new-password" : "current-password"
                    }
                    required
                />
            </div>

            <CaptchaField
                key={mode}
                ref={captchaRef}
                onTokenChange={setCaptchaToken}
            />

            <Button
                type="submit"
                size="lg"
                disabled={pending || (captchaEnabled && !captchaToken)}
            >
                {t(`${ns}.submit`)}
            </Button>

            <div className="relative flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                    {t("social.divider")}
                </span>
                <span className="h-px flex-1 bg-border" />
            </div>

            <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={signInWithGoogle}
            >
                <GoogleIcon className="size-5" />
                {t("social.google")}
            </Button>

            <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center text-sm text-corn-600 transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:underline active:scale-[var(--press-scale)]"
                onClick={switchMode}
            >
                {t(`${ns}.switch`)}
            </button>
        </form>
    );
}
