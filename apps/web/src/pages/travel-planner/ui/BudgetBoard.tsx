import { MoveRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Balance, Expense } from "@/entities/expense";
import type { Trip } from "@/entities/trip";
import type { TripMember } from "@/entities/member";
import { CategoryIcon, STOP_CATEGORIES, type StopCategory } from "@/entities/stop";
import { useFxRates } from "@/features/fx-rates";
import type { AddExpenseInput, FxRatesData } from "@/shared/api";
import {
  CURRENCIES,
  cn,
  convertMinorAmount,
  formatConvertedMoney,
  formatFxRate,
  formatMoney,
} from "@/shared/lib";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@/shared/ui/preview-card";
import { ScrambleText } from "@/shared/ui/scramble-text";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

function memberOf(trip: Trip, id: string): TripMember {
  return trip.members.find((m) => m.id === id) ?? trip.members[0]!;
}

/** Provenance behind a single settle-up transfer: who owes/is owed how much,
 * and the open amounts that produced the transfer at this step. */
interface SettlementTrace {
  from: string;
  to: string;
  amount: number;
  /** Debtor's total shortfall across the whole trip (share − paid). */
  debtorOwed: number;
  /** Creditor's total surplus across the whole trip (paid − share). */
  creditorDue: number;
  /** Debtor's still-open amount right before this transfer. */
  debtorRemaining: number;
  /** Creditor's still-open amount right before this transfer. */
  creditorRemaining: number;
}

/** Re-runs the greedy debtor↔creditor match (mirrors the server budget) to
 * recover, for each transfer, the numbers that explain its exact amount. The
 * algorithm is deterministic, so a `from→to` pair appears at most once. */
function traceSettlements(balances: readonly Balance[]): Map<string, SettlementTrace> {
  const owedByMember = new Map<string, number>();
  const dueByMember = new Map<string, number>();
  for (const b of balances) {
    if (b.net < 0) owedByMember.set(b.memberId, -b.net);
    else if (b.net > 0) dueByMember.set(b.memberId, b.net);
  }

  const debtors = [...owedByMember.entries()]
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v);
  const creditors = [...dueByMember.entries()]
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v);

  const traces = new Map<string, SettlementTrace>();
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const x = Math.min(debtor.v, creditor.v);
    if (x > 0.5) {
      traces.set(`${debtor.id}\u0000${creditor.id}`, {
        from: debtor.id,
        to: creditor.id,
        amount: Math.round(x),
        debtorOwed: owedByMember.get(debtor.id) ?? 0,
        creditorDue: dueByMember.get(creditor.id) ?? 0,
        debtorRemaining: Math.round(debtor.v),
        creditorRemaining: Math.round(creditor.v),
      });
    }
    debtor.v -= x;
    creditor.v -= x;
    if (debtor.v < 1) i++;
    if (creditor.v < 1) j++;
  }
  return traces;
}

export function BudgetBoard({
  trip,
  currentUserId,
  defaultCurrency,
  canEdit,
  onAddExpense,
  onUpdateExpense,
}: {
  trip: Trip;
  currentUserId: string;
  defaultCurrency: string;
  canEdit: boolean;
  onAddExpense: (input: AddExpenseInput) => void;
  onUpdateExpense: (expenseId: string, input: AddExpenseInput) => void;
}) {
  const { t, i18n } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const { budget, currency } = trip;
  const settlementTraces = traceSettlements(budget.balances);

  const [open, setOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [settleCurrency, setSettleCurrency] = useState(currency);
  const needsFx = settleCurrency !== currency;
  const { data: fxRates, isPending: fxPending, isError: fxError } = useFxRates(
    currency,
    needsFx,
  );

  useEffect(() => {
    setSettleCurrency(currency);
  }, [currency]);

  const startAdd = () => {
    setEditingExpenseId(null);
    setOpen((v) => !v);
  };

  const startEdit = (expenseId: string) => {
    setOpen(false);
    setEditingExpenseId(expenseId);
  };

  return (
    <div className="mx-auto grid w-full max-w-[1060px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-[18px] px-6 pb-10 pt-[62px]">
      {/* Expenses */}
      <div className="flex min-w-0 flex-col gap-[18px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
          <Stat label={t("budget.total")} value={formatMoney(budget.total, currency)} />
          <Stat label={t("budget.perPerson")} value={formatMoney(budget.perPerson, currency)} />
          <Stat label={t("budget.expenses")} value={String(trip.expenses.length)} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <span className="font-heading text-base font-semibold tracking-tight">
              {t("budget.expenseList")}
            </span>
            {canEdit ? (
              <Button variant="brand" size="sm" onClick={startAdd}>
                {open ? tc("actions.close") : t("budget.addExpense")}
              </Button>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="expense-form"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                className="overflow-hidden border-b border-border bg-background"
              >
                <ExpenseEditor
                  trip={trip}
                  tripCurrency={currency}
                  initial={emptyExpenseForm(trip, currentUserId, defaultCurrency || currency)}
                  submitLabel={t("budget.addExpense")}
                  onSubmit={(input) => {
                    onAddExpense(input);
                    setOpen(false);
                  }}
                  onCancel={() => setOpen(false)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {[...trip.expenses].reverse().map((e) => {
            const m = memberOf(trip, e.payer);
            const expenseCurrencyForDisplay = e.currency || currency;
            if (editingExpenseId === e.id) {
              return (
                <div
                  key={e.id}
                  className="border-b border-border bg-background last:border-b-0"
                >
                  <ExpenseEditor
                    trip={trip}
                    tripCurrency={currency}
                    initial={expenseToForm(e, trip, currency)}
                    submitLabel={t("budget.save")}
                    onSubmit={(input) => {
                      onUpdateExpense(e.id, input);
                      setEditingExpenseId(null);
                    }}
                    onCancel={() => setEditingExpenseId(null)}
                  />
                </div>
              );
            }
            const row = (
              <>
                <Avatar
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
                  src={m.image}
                  seed={m.id}
                  size={30}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <CategoryIcon category={e.category} />
                    <span className="truncate">{e.description}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {t("budget.paidBy", {
                      name: m.isCurrentUser ? t("budget.paidByYou") : m.shortName,
                      when: e.whenLabel,
                      count: e.participants.length,
                    })}
                  </span>
                </div>
                <div className="flex flex-none flex-col items-end gap-0.5">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(e.amount, expenseCurrencyForDisplay)}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                    {t("budget.each", {
                      amount: formatMoney(
                        e.amount / e.participants.length,
                        expenseCurrencyForDisplay,
                      ),
                    })}
                  </span>
                </div>
              </>
            );
            return canEdit ? (
              <button
                key={e.id}
                type="button"
                onClick={() => startEdit(e.id)}
                aria-label={t("budget.editExpense", { name: e.description })}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0",
                  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                  "hover:bg-accent/50 active:bg-accent/70",
                )}
              >
                {row}
              </button>
            ) : (
              <div
                key={e.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                {row}
              </div>
            );
          })}
        </div>
      </div>

      {/* Balances + settle up */}
      <div className="flex min-w-0 flex-col gap-[18px]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-4 py-3.5 font-heading text-base font-semibold tracking-tight">
            {t("budget.balances")}
          </div>
          {budget.balances.map((b) => {
            const m = memberOf(trip, b.memberId);
            const positive = b.net >= 0;
            return (
              <div
                key={b.memberId}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <Avatar
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
                  src={m.image}
                  seed={m.id}
                  size={30}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {m.isCurrentUser ? t("budget.you", { name: m.name }) : m.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {t("budget.balanceSub", {
                      paid: formatMoney(b.paid, currency),
                      share: formatMoney(b.share, currency),
                    })}
                  </span>
                </div>
                <span
                  className={cn(
                    "flex-none whitespace-nowrap font-mono text-sm font-semibold tabular-nums",
                    positive ? "text-success-foreground" : "text-destructive-foreground",
                  )}
                >
                  {positive ? "+" : "−"}
                  {formatMoney(Math.abs(b.net), currency)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading text-base font-semibold tracking-tight text-balance">
                {t("budget.settleUp")}
              </span>
              <span className="text-xs text-muted-foreground text-pretty">
                {t("budget.transfersClear", { count: budget.settlements.length })}
              </span>
            </div>
            <SettlementCurrencySelect
              value={settleCurrency}
              onChange={setSettleCurrency}
            />
          </div>
          {budget.settlements.map((s, i) => {
            const from = memberOf(trip, s.from);
            const to = memberOf(trip, s.to);
            const trace = settlementTraces.get(`${s.from}\u0000${s.to}`);
            const displayAmount = formatSettlementAmount(
              s.amount,
              currency,
              settleCurrency,
              fxRates,
              i18n.language,
            );
            return (
              <PreviewCard key={i}>
                <PreviewCardTrigger
                  delay={140}
                  closeDelay={80}
                  render={
                    <div
                      tabIndex={0}
                      aria-label={t("budget.derivation.aria", {
                        from: from.shortName,
                        to: to.shortName,
                        amount: displayAmount,
                      })}
                    />
                  }
                  className={cn(
                    "flex cursor-help items-start gap-3 border-b border-border px-4 py-3.5 outline-none last:border-b-0",
                    "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                    "hover:bg-accent/50 focus-visible:bg-accent/50",
                  )}
                >
                  <div className="flex w-[54px] flex-none flex-col items-center gap-1.5">
                    <Avatar
                      name={from.name}
                      bg={from.avatarBg}
                      fg={from.avatarFg}
                      src={from.image}
                      seed={from.id}
                      size={30}
                    />
                    <span className="max-w-full truncate text-center text-[11px] font-medium text-muted-foreground">
                      {from.shortName}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-[7px]">
                    {needsFx && fxPending ? (
                      <span className="font-mono text-sm font-semibold tabular-nums text-corn-600">
                        …
                      </span>
                    ) : (
                      <ScrambleText
                        key={`${settleCurrency}:${displayAmount}`}
                        className="font-mono text-sm font-semibold tabular-nums text-corn-600"
                      >
                        {displayAmount}
                      </ScrambleText>
                    )}
                    <MoveRight
                      className="h-4 w-full text-corn-300"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex w-[54px] flex-none flex-col items-center gap-1.5">
                    <Avatar
                      name={to.name}
                      bg={to.avatarBg}
                      fg={to.avatarFg}
                      src={to.image}
                      seed={to.id}
                      size={30}
                    />
                    <span className="max-w-full truncate text-center text-[11px] font-medium text-muted-foreground">
                      {to.shortName}
                    </span>
                  </div>
                </PreviewCardTrigger>
                {trace ? (
                  <PreviewCardPopup>
                    <SettlementFxDetails
                      amount={s.amount}
                      tripCurrency={currency}
                      settleCurrency={settleCurrency}
                      fxRates={fxRates}
                      fxPending={needsFx && fxPending}
                      fxError={needsFx && fxError}
                      locale={i18n.language}
                    />
                    <SettlementDerivation
                      from={from}
                      to={to}
                      trace={trace}
                      expenses={trip.expenses}
                      currency={currency}
                    />
                  </PreviewCardPopup>
                ) : null}
              </PreviewCard>
            );
          })}
          <div className="px-4 py-3 text-xs text-muted-foreground">
            {t("budget.everyonePaid")}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettlementCurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation("planner");
  return (
    <Select
      items={CURRENCIES.map((c) => ({ value: c, label: c }))}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onChange(next);
      }}
    >
      <SelectTrigger
        className="h-9 w-[92px] flex-none rounded-lg tabular-nums"
        aria-label={t("budget.settleCurrencyLabel")}
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

function formatSettlementAmount(
  amount: number,
  tripCurrency: string,
  settleCurrency: string,
  fxRates: FxRatesData | undefined,
  locale: string,
): string {
  if (settleCurrency === tripCurrency) {
    return formatMoney(amount, tripCurrency, locale);
  }
  if (!fxRates) return formatMoney(amount, tripCurrency, locale);
  const converted = convertMinorAmount(
    amount,
    tripCurrency,
    settleCurrency,
    fxRates.rates,
    fxRates.base,
  );
  if (converted == null) return formatMoney(amount, tripCurrency, locale);
  return formatConvertedMoney(converted, settleCurrency, locale);
}

function SettlementFxDetails({
  amount,
  tripCurrency,
  settleCurrency,
  fxRates,
  fxPending,
  fxError,
  locale,
}: {
  amount: number;
  tripCurrency: string;
  settleCurrency: string;
  fxRates: FxRatesData | undefined;
  fxPending: boolean;
  fxError: boolean;
  locale: string;
}) {
  const { t } = useTranslation("planner");
  if (settleCurrency === tripCurrency) return null;

  if (fxPending) {
    return (
      <div className="mb-3 border-b border-border pb-3 text-xs text-muted-foreground">
        {t("budget.fx.loading")}
      </div>
    );
  }

  if (fxError || !fxRates) {
    return (
      <div className="mb-3 border-b border-border pb-3 text-xs text-muted-foreground">
        {t("budget.fx.unavailable")}
      </div>
    );
  }

  const rate =
    settleCurrency === fxRates.base ? 1 : fxRates.rates[settleCurrency];
  const converted = convertMinorAmount(
    amount,
    tripCurrency,
    settleCurrency,
    fxRates.rates,
    fxRates.base,
  );
  if (rate == null || converted == null) {
    return (
      <div className="mb-3 border-b border-border pb-3 text-xs text-muted-foreground">
        {t("budget.fx.unavailable")}
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-1 border-b border-border pb-3">
      <span className="text-[11px] font-medium text-muted-foreground">
        {t("budget.fx.title")}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {formatFxRate(tripCurrency, settleCurrency, rate, locale)}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {t("budget.fx.converted", {
          original: formatMoney(amount, tripCurrency, locale),
          converted: formatConvertedMoney(converted, settleCurrency, locale),
        })}
      </span>
      <span className="text-[10px] text-muted-foreground/80">
        {t("budget.fx.asOf", {
          date: fxRates.date,
          provider: fxRates.provider,
        })}
      </span>
    </div>
  );
}

/** One expense's contribution to a member's tab. */
interface ExpenseLine {
  id: string;
  description: string;
  category: StopCategory;
  amount: number;
}

interface MemberBreakdown {
  /** Expenses the member joined, with their per-head portion. */
  shareItems: ExpenseLine[];
  /** Expenses the member fronted, with the full amount. */
  paidItems: ExpenseLine[];
  shareSum: number;
  paidSum: number;
}

/** Split a member's trip expenses into what they owe a share of and what they
 * fronted, so the settle-up card can show where every number comes from.
 * Mirrors `computeBudget`: share = amount ÷ participants, paid = full amount. */
function memberBreakdown(
  expenses: readonly Expense[],
  memberId: string,
): MemberBreakdown {
  const shareItems: ExpenseLine[] = [];
  const paidItems: ExpenseLine[] = [];
  let shareSum = 0;
  let paidSum = 0;
  for (const e of expenses) {
    if (e.participants.includes(memberId) && e.participants.length > 0) {
      const portion = e.amount / e.participants.length;
      shareSum += portion;
      shareItems.push({
        id: e.id,
        description: e.description,
        category: e.category,
        amount: portion,
      });
    }
    if (e.payer === memberId) {
      paidSum += e.amount;
      paidItems.push({
        id: e.id,
        description: e.description,
        category: e.category,
        amount: e.amount,
      });
    }
  }
  return { shareItems, paidItems, shareSum, paidSum };
}

/** A titled list of expense lines with a right-aligned subtotal. */
function ExpenseGroup({
  label,
  items,
  subtotal,
  currency,
}: {
  label: string;
  items: ExpenseLine[];
  subtotal: number;
  currency: string;
}) {
  const fmt = (n: number) => formatMoney(n, currency);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{fmt(subtotal)}</span>
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 pl-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1 text-foreground/80">
                <CategoryIcon category={it.category} />
                <span className="truncate">{it.description}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {fmt(it.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One member's account: the expenses they owe a share of, the ones they paid,
 * and the net that lands them in the settle-up plan. */
function MemberLedger({
  member,
  kind,
  breakdown,
  currency,
}: {
  member: TripMember;
  kind: "debtor" | "creditor";
  breakdown: MemberBreakdown;
  currency: string;
}) {
  const { t } = useTranslation("planner");
  const isDebtor = kind === "debtor";
  const net = isDebtor
    ? breakdown.shareSum - breakdown.paidSum
    : breakdown.paidSum - breakdown.shareSum;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Avatar
          name={member.name}
          bg={member.avatarBg}
          fg={member.avatarFg}
          src={member.image}
          seed={member.id}
          size={18}
        />
        <span className="truncate text-[12px] font-semibold">
          {t(
            isDebtor ? "budget.derivation.owesTitle" : "budget.derivation.owedTitle",
            { name: member.shortName },
          )}
        </span>
      </div>
      <ExpenseGroup
        label={t("budget.derivation.fairShare")}
        items={breakdown.shareItems}
        subtotal={breakdown.shareSum}
        currency={currency}
      />
      <ExpenseGroup
        label={t("budget.derivation.paid")}
        items={breakdown.paidItems}
        subtotal={breakdown.paidSum}
        currency={currency}
      />
      <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-1 text-[13px] font-semibold tabular-nums">
        <span>
          {t(isDebtor ? "budget.derivation.owes" : "budget.derivation.owed")}
        </span>
        <span className="font-mono">{formatMoney(net, currency)}</span>
      </div>
    </div>
  );
}

/** Hover card content that shows which expenses generated each side's tab and
 * how they aggregate into this transfer. The debtor's shares minus what they
 * paid leaves what they owe; the plan sends it to the creditor, capped by what
 * that creditor is still owed. */
function SettlementDerivation({
  from,
  to,
  trace,
  expenses,
  currency,
}: {
  from: TripMember;
  to: TripMember;
  trace: SettlementTrace;
  expenses: readonly Expense[];
  currency: string;
}) {
  const { t } = useTranslation("planner");
  const fmt = (n: number) => formatMoney(n, currency);
  const fromBreakdown = memberBreakdown(expenses, from.id);
  const toBreakdown = memberBreakdown(expenses, to.id);

  return (
    <div className="flex w-[300px] flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <Avatar
          name={from.name}
          bg={from.avatarBg}
          fg={from.avatarFg}
          src={from.image}
          seed={from.id}
          size={20}
        />
        <span className="truncate text-[13px] font-medium">{from.shortName}</span>
        <MoveRight
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={2}
          aria-hidden="true"
        />
        <Avatar
          name={to.name}
          bg={to.avatarBg}
          fg={to.avatarFg}
          src={to.image}
          seed={to.id}
          size={20}
        />
        <span className="truncate text-[13px] font-medium">{to.shortName}</span>
        <span className="ml-auto shrink-0 font-mono text-[13px] font-semibold tabular-nums text-corn-600">
          {fmt(trace.amount)}
        </span>
      </div>

      <div className="flex max-h-[46vh] flex-col gap-2.5 overflow-y-auto">
        <MemberLedger
          member={from}
          kind="debtor"
          breakdown={fromBreakdown}
          currency={currency}
        />
        <MemberLedger
          member={to}
          kind="creditor"
          breakdown={toBreakdown}
          currency={currency}
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/70 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("budget.derivation.transfer")}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          {t("budget.derivation.rule", {
            from: from.shortName,
            to: to.shortName,
          })}
        </p>
        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
          <span className="text-muted-foreground">
            min({fmt(trace.debtorRemaining)}, {fmt(trace.creditorRemaining)})
          </span>
          <span className="font-semibold text-corn-600">= {fmt(trace.amount)}</span>
        </div>
      </div>
    </div>
  );
}

interface ExpenseFormState {
  desc: string;
  amount: string;
  expenseCurrency: string;
  category: StopCategory;
  payer: string;
  parts: Record<string, boolean>;
}

function emptyExpenseForm(
  trip: Trip,
  currentUserId: string,
  defaultCurrency: string,
): ExpenseFormState {
  return {
    desc: "",
    amount: "",
    expenseCurrency: defaultCurrency,
    category: "Food",
    payer: currentUserId,
    parts: Object.fromEntries(trip.members.map((m) => [m.id, true])),
  };
}

function expenseToForm(
  expense: Expense,
  trip: Trip,
  tripCurrency: string,
): ExpenseFormState {
  return {
    desc: expense.description,
    amount: String(expense.amount),
    expenseCurrency: expense.currency || tripCurrency,
    category: expense.category,
    payer: expense.payer,
    parts: Object.fromEntries(
      trip.members.map((m) => [m.id, expense.participants.includes(m.id)]),
    ),
  };
}

/** Shared add/edit expense form used inline in the expense list. */
function ExpenseEditor({
  trip,
  tripCurrency,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  trip: Trip;
  tripCurrency: string;
  initial: ExpenseFormState;
  submitLabel: string;
  onSubmit: (input: AddExpenseInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const [desc, setDesc] = useState(initial.desc);
  const [amount, setAmount] = useState(initial.amount);
  const [expenseCurrency, setExpenseCurrency] = useState(initial.expenseCurrency);
  const [category, setCategory] = useState(initial.category);
  const [payer, setPayer] = useState(initial.payer);
  const [parts, setParts] = useState(initial.parts);

  useEffect(() => {
    setDesc(initial.desc);
    setAmount(initial.amount);
    setExpenseCurrency(initial.expenseCurrency);
    setCategory(initial.category);
    setPayer(initial.payer);
    setParts(initial.parts);
  }, [initial]);

  const submit = () => {
    const value = Number.parseFloat(amount);
    const participants = trip.members.map((m) => m.id).filter((id) => parts[id]);
    if (!desc.trim() || !(value > 0) || participants.length === 0) return;
    onSubmit({
      description: desc.trim(),
      amount: Math.round(value),
      currency: expenseCurrency,
      category,
      payer,
      participants,
    });
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-col gap-2">
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("budget.descPlaceholder")}
          aria-label={t("budget.descPlaceholder")}
          className="h-8"
        />
        <div className="flex min-w-0 items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("budget.amountPlaceholder")}
            aria-label={t("budget.amountPlaceholder")}
            className="h-8 min-w-0 flex-1"
          />
          <Select
            items={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={expenseCurrency}
            onValueChange={(value) =>
              setExpenseCurrency((value as string) || tripCurrency)
            }
          >
            <SelectTrigger
              className="h-8 w-[84px] flex-none rounded-lg tabular-nums"
              aria-label={t("budget.currencyLabel")}
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
        </div>
        <Select
          items={STOP_CATEGORIES.map((c) => ({
            value: c,
            label: t(`category.${c}`),
          }))}
          value={category}
          onValueChange={(value) =>
            setCategory((value as StopCategory) || "Food")
          }
        >
          <SelectTrigger
            className="h-8 rounded-lg"
            aria-label={t("budget.categoryLabel")}
          >
            <SelectValue>
              {(value: StopCategory) => (
                <span className="flex items-center gap-2">
                  <CategoryIcon category={value} />
                  {t(`category.${value}`)}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {STOP_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-2">
                  <CategoryIcon category={c} />
                  {t(`category.${c}`)}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <span className="w-16 shrink-0 pt-2 text-xs font-medium text-muted-foreground">
          {t("budget.payer")}
        </span>
        {trip.members.map((m) => (
          <MemberChoice
            key={m.id}
            member={m}
            selected={payer === m.id}
            onClick={() => setPayer(m.id)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <span className="w-16 shrink-0 pt-2 text-xs font-medium text-muted-foreground">
          {t("budget.splitWith")}
        </span>
        {trip.members.map((m) => (
          <MemberChoice
            key={m.id}
            member={m}
            selected={!!parts[m.id]}
            onClick={() => setParts((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {tc("actions.cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function MemberChoice({
  member,
  selected,
  onClick,
}: {
  member: TripMember;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-medium",
        "transition-[background-color,color,border-color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[var(--press-scale)]",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <Avatar
        name={member.name}
        bg={member.avatarBg}
        fg={member.avatarFg}
        src={member.image}
        seed={member.id}
        size={22}
        className={selected ? "ring-1 ring-primary-foreground/30" : undefined}
      />
      {member.shortName}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px] rounded-2xl border border-border bg-card p-4 shadow-xs">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
