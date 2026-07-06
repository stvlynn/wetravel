import { forwardRef } from "react";
import {
  Turnstile as TurnstilePrimitive,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import { useResolvedTheme } from "@/shared/lib/theme";

export interface TurnstileProps {
  siteKey: string;
  language?: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export const Turnstile = forwardRef<TurnstileInstance, TurnstileProps>(
  function Turnstile({ siteKey, language, onSuccess, onError, onExpire }, ref) {
    const theme = useResolvedTheme();

    return (
      <div className="w-full overflow-hidden rounded-lg border border-border">
        <TurnstilePrimitive
          ref={ref}
          siteKey={siteKey}
          options={{
            theme,
            language,
            size: "flexible",
          }}
          onSuccess={onSuccess}
          onError={onError}
          onExpire={onExpire}
        />
      </div>
    );
  },
);
