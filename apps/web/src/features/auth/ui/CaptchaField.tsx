import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Turnstile } from "@/shared/ui/turnstile";
import { config } from "@/shared/config";

export interface CaptchaFieldRef {
  reset: () => void;
}

interface CaptchaFieldProps {
  onTokenChange: (token: string | null) => void;
}

export const CaptchaField = forwardRef<CaptchaFieldRef, CaptchaFieldProps>(
  function CaptchaField({ onTokenChange }, ref) {
    const { t, i18n } = useTranslation("auth");
    const widgetRef = useRef<TurnstileInstance>(null);
    const [error, setError] = useState(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        widgetRef.current?.reset();
        setError(false);
        onTokenChange(null);
      },
    }));

    if (
      config.captchaProvider !== "cloudflare-turnstile" ||
      !config.turnstileSiteKey
    ) {
      return null;
    }

    return (
      <div className="flex flex-col gap-1.5">
        <Turnstile
          ref={widgetRef}
          siteKey={config.turnstileSiteKey}
          language={i18n.language}
          onSuccess={(token) => {
            setError(false);
            onTokenChange(token);
          }}
          onError={() => {
            setError(true);
            onTokenChange(null);
          }}
          onExpire={() => {
            setError(false);
            onTokenChange(null);
          }}
        />
        {error ? (
          <span className="text-sm text-destructive" role="alert">
            {t("captcha.error")}
          </span>
        ) : null}
      </div>
    );
  },
);
