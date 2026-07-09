import { useQuery } from "@tanstack/react-query";
import { fetchFxRates, type FxRatesData } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { CURRENCIES } from "@/shared/lib";

/** Quotes requested for settle-up conversion — the app currency picker set. */
const SETTLE_QUOTES = CURRENCIES;

export function useFxRates(base: string, enabled = true) {
  const normalizedBase = base.trim().toUpperCase();
  const quotesKey = [...SETTLE_QUOTES].sort().join(",");

  const { data, isPending, isError, error, refetch } = useQuery<
    FxRatesData,
    Error
  >({
    queryKey: queryKeys.fxRates(normalizedBase, quotesKey),
    queryFn: ({ signal }) =>
      fetchFxRates(normalizedBase, SETTLE_QUOTES, { signal }),
    enabled: enabled && Boolean(normalizedBase),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  return { data, isPending, isError, error, refetch };
}
