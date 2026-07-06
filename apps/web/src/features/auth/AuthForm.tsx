import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { signIn, signUp } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { toastManager } from "@/shared/ui/toast";
import { config } from "@/shared/config";
import { CaptchaField, type CaptchaFieldRef } from "./ui/CaptchaField";

type Mode = "signIn" | "signUp";

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

export function AuthForm() {
    const { t } = useTranslation("auth");
    const [mode, setMode] = useState<Mode>("signIn");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRef = useRef<CaptchaFieldRef>(null);
    const captchaEnabled =
        config.captchaProvider === "cloudflare-turnstile" &&
        !!config.turnstileSiteKey;

    const isSignUp = mode === "signUp";

    function showAuthError() {
        toastManager.add({
            title: t("errors.toastTitle"),
            description: t("errors.generic"),
            type: "error",
        });
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (captchaEnabled && !captchaToken) return;

        setPending(true);
        try {
            const result = isSignUp
                ? await signUp.email({
                      name,
                      email,
                      password,
                      fetchOptions: {
                          headers: {
                              "x-captcha-response": captchaToken ?? "",
                          },
                      },
                  })
                : await signIn.email({
                      email,
                      password,
                      fetchOptions: {
                          headers: {
                              "x-captcha-response": captchaToken ?? "",
                          },
                      },
                  });
            if (result.error) {
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

    async function signInWithGoogle() {
        setPending(true);
        try {
            const result = await signIn.social({ provider: "google" });
            if (result.error) showAuthError();
        } catch {
            showAuthError();
        } finally {
            setPending(false);
        }
    }

    const ns = isSignUp ? "signUp" : "signIn";

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
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

            <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t(`${ns}.password`)}
                <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                        isSignUp ? "new-password" : "current-password"
                    }
                    required
                />
            </label>

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
                onClick={() => {
                    setMode(isSignUp ? "signIn" : "signUp");
                }}
            >
                {t(`${ns}.switch`)}
            </button>
        </form>
    );
}
