import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/app/router";
import { toTripSummary, type TripSummary } from "@/entities/trip";
import { createTrip, type CreateTripInput } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { useSession } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogSheetPopup,
  DialogSheetViewport,
  DialogPortal,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  cn,
  CURRENCIES,
  currencySelectItems,
  formatMoney,
} from "@/shared/lib";
import {
  CurrencyLabel,
  currencySelectPopupClass,
  currencySelectTriggerClass,
  currencySelectValueClass,
} from "@/shared/ui/currency-label";

type WizardStep =
  | "destination"
  | "duration"
  | "dates"
  | "budget"
  | "party"
  | "review";

const STEPS: WizardStep[] = [
  "destination",
  "duration",
  "dates",
  "budget",
  "party",
  "review",
];

interface WizardAnswers {
  destination: string | null;
  dayCount: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
  budgetCurrency: string;
  partySize: number | null;
}

function emptyAnswers(currency: string): WizardAnswers {
  return {
    destination: null,
    dayCount: null,
    startDate: null,
    endDate: null,
    budgetAmount: null,
    budgetCurrency: currency,
    partySize: null,
  };
}

/** Placeholder title when destination is TBD. */
function defaultTripName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `new-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function buildCreateInput(
  answers: WizardAnswers,
  titleForDestination: (dest: string) => string,
): CreateTripInput {
  const input: CreateTripInput = {
    title: answers.destination
      ? titleForDestination(answers.destination)
      : defaultTripName(),
    currency: answers.budgetCurrency,
  };
  if (answers.destination) input.destination = answers.destination;
  if (answers.dayCount != null) input.dayCount = answers.dayCount;
  if (answers.startDate) input.startDate = answers.startDate;
  if (answers.endDate) input.endDate = answers.endDate;
  if (answers.budgetAmount != null) input.budgetAmount = answers.budgetAmount;
  if (answers.partySize != null) input.partySize = answers.partySize;
  return input;
}

export function CreateTripWizardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("trips");
  const { t: tc } = useTranslation("common");
  const locale = i18n.resolvedLanguage ?? "en";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { navigate } = useRouter();
  const preferredCurrency = session?.user?.defaultCurrency?.trim() || "JPY";

  const [step, setStep] = useState<WizardStep>("destination");
  const [answers, setAnswers] = useState<WizardAnswers>(() =>
    emptyAnswers(preferredCurrency),
  );
  const [draftText, setDraftText] = useState("");
  const [stepKey, setStepKey] = useState(0);

  const create = useMutation({
    mutationFn: (input: CreateTripInput) => createTrip(input),
    onSuccess: (trip) => {
      // Echo the POST body into caches — do not invalidate/refetch GET /api/trips
      // immediately (Hyperdrive may serve a stale SELECT for up to ~60s).
      // See TanStack Query "Updates from Mutation Responses" and
      // docs/operations/cloudflare.md (Hyperdrive read-after-write).
      queryClient.setQueryData(queryKeys.trip(trip.id), trip);
      queryClient.setQueryData<TripSummary[]>(queryKeys.trips, (prev) => {
        const summary = toTripSummary(trip);
        if (!prev) return [summary];
        if (prev.some((t) => t.id === trip.id)) return prev;
        return [summary, ...prev];
      });
      onOpenChange(false);
      reset();
      navigate(`/trips/${trip.id}`);
    },
  });

  function reset() {
    setStep("destination");
    setAnswers(emptyAnswers(preferredCurrency));
    setDraftText("");
    setStepKey(0);
    create.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
    else {
      setAnswers(emptyAnswers(preferredCurrency));
      setStep("destination");
      setDraftText("");
      setStepKey((k) => k + 1);
    }
  }

  function goTo(next: WizardStep) {
    setStep(next);
    setStepKey((k) => k + 1);
    // Prefill draft from current answers when entering a step.
    if (next === "destination") setDraftText(answers.destination ?? "");
    else if (next === "duration")
      setDraftText(answers.dayCount != null ? String(answers.dayCount) : "");
    else if (next === "budget")
      setDraftText(
        answers.budgetAmount != null ? String(answers.budgetAmount) : "",
      );
    else if (next === "party")
      setDraftText(answers.partySize != null ? String(answers.partySize) : "");
    else setDraftText("");
  }

  const stepIndex = STEPS.indexOf(step);

  function markTbdAndAdvance() {
    const patch: Partial<WizardAnswers> = {};
    if (step === "destination") patch.destination = null;
    if (step === "duration") patch.dayCount = null;
    if (step === "dates") {
      patch.startDate = null;
      patch.endDate = null;
    }
    if (step === "budget") patch.budgetAmount = null;
    if (step === "party") patch.partySize = null;
    const nextAnswers = { ...answers, ...patch };
    setAnswers(nextAnswers);
    goTo(STEPS[stepIndex + 1]!);
  }

  function commitAndAdvance() {
    if (step === "destination") {
      const value = draftText.trim();
      if (!value) return;
      setAnswers({ ...answers, destination: value });
      goTo("duration");
      return;
    }
    if (step === "duration") {
      const n = Number.parseInt(draftText, 10);
      if (!Number.isInteger(n) || n < 1) return;
      const next = { ...answers, dayCount: n };
      if (next.startDate && !next.endDate) {
        next.endDate = addDaysIso(next.startDate, n - 1);
      }
      setAnswers(next);
      goTo("dates");
      return;
    }
    if (step === "dates") {
      if (!answers.startDate || !answers.endDate) return;
      if (answers.endDate < answers.startDate) return;
      goTo("budget");
      return;
    }
    if (step === "budget") {
      const n = Number.parseFloat(draftText);
      if (!Number.isFinite(n) || n <= 0) return;
      setAnswers({ ...answers, budgetAmount: n });
      goTo("party");
      return;
    }
    if (step === "party") {
      const n = Number.parseInt(draftText, 10);
      if (!Number.isInteger(n) || n < 1) return;
      setAnswers({ ...answers, partySize: n });
      goTo("review");
      return;
    }
    if (step === "review") {
      create.mutate(
        buildCreateInput(answers, (dest) =>
          t("wizard.titleFromDestination", { destination: dest }),
        ),
      );
    }
  }

  function goBack() {
    if (stepIndex <= 0) return;
    goTo(STEPS[stepIndex - 1]!);
  }

  const canContinue =
    step === "review" ||
    (step === "destination" && draftText.trim().length > 0) ||
    (step === "duration" &&
      Number.isInteger(Number.parseInt(draftText, 10)) &&
      Number.parseInt(draftText, 10) >= 1) ||
    (step === "dates" &&
      !!answers.startDate &&
      !!answers.endDate &&
      answers.endDate >= answers.startDate) ||
    (step === "budget" &&
      Number.isFinite(Number.parseFloat(draftText)) &&
      Number.parseFloat(draftText) > 0) ||
    (step === "party" &&
      Number.isInteger(Number.parseInt(draftText, 10)) &&
      Number.parseInt(draftText, 10) >= 1);

  const tbdLabel = t("wizard.tbd");

  function reviewValue(value: string | number | null | undefined): string {
    if (value == null || value === "") return tbdLabel;
    return String(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogSheetViewport>
          <DialogSheetPopup size="sm">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="text-lg font-semibold tracking-tight text-balance">
                  {t(`wizard.steps.${step}.title`)}
                </DialogTitle>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {step === "review"
                    ? `${STEPS.length - 1} / ${STEPS.length - 1}`
                    : `${stepIndex + 1} / ${STEPS.length - 1}`}
                </span>
              </div>
              <DialogDescription className="text-sm text-pretty text-muted-foreground">
                {t(`wizard.steps.${step}.description`)}
              </DialogDescription>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {STEPS.filter((s) => s !== "review").map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-[background-color] duration-[var(--dur-base)] ease-[var(--ease-out)]",
                      i <= stepIndex ? "bg-brand" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            </DialogHeader>

            <DialogPanel>
              <div key={stepKey} className="wf-enter flex flex-col gap-3">
                {step === "destination" ? (
                  <Input
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder={t("wizard.steps.destination.placeholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canContinue) commitAndAdvance();
                    }}
                  />
                ) : null}

                {step === "duration" ? (
                  <Input
                    autoFocus
                    type="number"
                    min={1}
                    max={60}
                    inputMode="numeric"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder={t("wizard.steps.duration.placeholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canContinue) commitAndAdvance();
                    }}
                  />
                ) : null}

                {step === "dates" ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("wizard.steps.dates.start")}
                      </span>
                      <Input
                        type="date"
                        value={answers.startDate ?? ""}
                        onChange={(e) => {
                          const startDate = e.target.value || null;
                          setAnswers((prev) => {
                            const next = { ...prev, startDate };
                            if (
                              startDate &&
                              prev.dayCount != null &&
                              !prev.endDate
                            ) {
                              next.endDate = addDaysIso(
                                startDate,
                                prev.dayCount - 1,
                              );
                            }
                            return next;
                          });
                        }}
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("wizard.steps.dates.end")}
                      </span>
                      <Input
                        type="date"
                        value={answers.endDate ?? ""}
                        min={answers.startDate ?? undefined}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            endDate: e.target.value || null,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {step === "budget" ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      type="number"
                      min={1}
                      step="any"
                      inputMode="decimal"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={t("wizard.steps.budget.placeholder")}
                      className="min-w-0 flex-1 tabular-nums"
                      aria-label={t("wizard.steps.budget.title")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canContinue) commitAndAdvance();
                      }}
                    />
                    <Select
                      items={currencySelectItems(locale)}
                      value={answers.budgetCurrency}
                      onValueChange={(value) => {
                        const next = String(value);
                        setAnswers((prev) => ({
                          ...prev,
                          budgetCurrency: next,
                        }));
                      }}
                    >
                      <SelectTrigger
                        className={`${currencySelectTriggerClass} rounded-lg`}
                        aria-label={t("wizard.steps.budget.currencyLabel")}
                      >
                        <SelectValue className={currencySelectValueClass}>
                          {(selected: string | null) =>
                            selected ? (
                              <CurrencyLabel code={selected} locale={locale} />
                            ) : null
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup className={currencySelectPopupClass}>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            <CurrencyLabel code={c} locale={locale} />
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                ) : null}

                {step === "party" ? (
                  <Input
                    autoFocus
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder={t("wizard.steps.party.placeholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canContinue) commitAndAdvance();
                    }}
                  />
                ) : null}

                {step === "review" ? (
                  <dl className="flex flex-col gap-2.5 text-sm">
                    {(
                      [
                        ["destination", reviewValue(answers.destination)],
                        [
                          "duration",
                          answers.dayCount != null
                            ? t("wizard.review.days", { count: answers.dayCount })
                            : tbdLabel,
                        ],
                        [
                          "dates",
                          answers.startDate && answers.endDate
                            ? t("card.dates", {
                                start: answers.startDate,
                                end: answers.endDate,
                              })
                            : tbdLabel,
                        ],
                        [
                          "budget",
                          answers.budgetAmount != null
                            ? formatMoney(
                                answers.budgetAmount,
                                answers.budgetCurrency,
                              )
                            : tbdLabel,
                        ],
                        [
                          "party",
                          answers.partySize != null
                            ? t("wizard.review.people", {
                                count: answers.partySize,
                              })
                            : tbdLabel,
                        ],
                      ] as const
                    ).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                      >
                        <dt className="text-muted-foreground">
                          {t(`wizard.review.${key}`)}
                        </dt>
                        <dd className="text-right font-medium text-balance">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </DialogPanel>

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6">
              <div className="flex gap-2">
                {stepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    disabled={create.isPending}
                  >
                    {t("wizard.back")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleOpenChange(false)}
                    disabled={create.isPending}
                  >
                    {tc("actions.cancel")}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {step !== "review" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={markTbdAndAdvance}
                    disabled={create.isPending}
                  >
                    {t("wizard.tbd")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="brand"
                  disabled={!canContinue || create.isPending}
                  onClick={commitAndAdvance}
                >
                  {create.isPending ? (
                    <Spinner className="size-4" />
                  ) : null}
                  {step === "review" ? t("wizard.create") : t("wizard.next")}
                </Button>
              </div>
            </DialogFooter>
          </DialogSheetPopup>
        </DialogSheetViewport>
      </DialogPortal>
    </Dialog>
  );
}
