import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { signIn, signUp } from "@/shared/auth";
import { cn, usePresence } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type Mode = "signIn" | "signUp";

export function AuthForm() {
  const { t } = useTranslation("auth");
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lastError = useRef<string | null>(null);
  if (error) lastError.current = error;

  const isSignUp = mode === "signUp";
  const { mounted: nameMounted, exiting: nameExiting } = usePresence(isSignUp);
  const { mounted: errorMounted, exiting: errorExiting } = usePresence(!!error);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = isSignUp
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });
      if (result.error) setError(t("errors.generic"));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  const ns = isSignUp ? "signUp" : "signIn";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="wf-enter-stagger flex flex-col gap-4">
        <div className="wf-enter flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-balance">
            {t(`${ns}.title`)}
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">{t(`${ns}.subtitle`)}</p>
        </div>

        {nameMounted ? (
          <label
            className={cn(
              "wf-enter flex flex-col gap-1.5 text-sm font-medium",
              nameExiting && "wf-exit",
            )}
          >
            {t("signUp.name")}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        ) : null}

        <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
          {t(`${ns}.email`)}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="wf-enter flex flex-col gap-1.5 text-sm font-medium">
          {t(`${ns}.password`)}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
          />
        </label>

        {errorMounted && lastError.current ? (
          <p
            className={cn(
              "text-sm text-pretty text-destructive-foreground",
              errorExiting ? "wf-exit" : "wf-enter",
            )}
            role="alert"
          >
            {lastError.current}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending} className="wf-enter">
          {t(`${ns}.submit`)}
        </Button>

        <button
          type="button"
          className="wf-enter inline-flex min-h-10 items-center justify-center text-sm text-corn-600 transition-[color,scale] duration-150 hover:underline active:scale-[0.96]"
          onClick={() => {
            setMode(isSignUp ? "signIn" : "signUp");
            setError(null);
          }}
        >
          {t(`${ns}.switch`)}
        </button>
      </div>
    </form>
  );
}
