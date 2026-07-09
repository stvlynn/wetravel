import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient, useSession } from "@/shared/auth";
import { CURRENCIES } from "@/shared/lib";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { toastManager } from "@/shared/ui/toast";

const FALLBACK_CURRENCY = "JPY";

export function CurrencySelect(): React.ReactElement {
  const { t } = useTranslation("common");
  const { data: session, isPending: sessionPending, refetch } = useSession();
  const sessionCurrency = session?.user?.defaultCurrency?.trim() || FALLBACK_CURRENCY;
  const [pending, setPending] = useState<string | null>(null);
  const value = pending ?? sessionCurrency;
  const busy = sessionPending || pending !== null;

  const handleValueChange = async (next: string | null) => {
    if (!next || next === sessionCurrency || busy) return;
    setPending(next);
    try {
      const result = await authClient.updateUser({ defaultCurrency: next });
      if (result.error) throw result.error;
      await refetch();
    } catch {
      toastManager.add({
        title: t("settings.currency.errorTitle"),
        description: t("settings.currency.errors.saveFailed"),
        type: "error",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Select
      items={CURRENCIES.map((c) => ({ value: c, label: c }))}
      value={value}
      onValueChange={handleValueChange}
      disabled={busy}
    >
      <SelectTrigger
        className="w-40 tabular-nums"
        aria-label={t("settings.currency.label")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
