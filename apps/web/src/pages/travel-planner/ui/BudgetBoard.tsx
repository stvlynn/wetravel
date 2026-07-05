import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import type { TripMember } from "@/entities/member";
import type { AddExpenseInput } from "@/shared/api";
import { CURRENCIES, cn, formatMoney } from "@/shared/lib";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
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

export function BudgetBoard({
  trip,
  currentUserId,
  defaultCurrency,
  onAddExpense,
}: {
  trip: Trip;
  currentUserId: string;
  defaultCurrency: string;
  onAddExpense: (input: AddExpenseInput) => void;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const { budget, currency } = trip;

  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState(
    defaultCurrency || currency,
  );
  const [payer, setPayer] = useState(currentUserId);
  const [parts, setParts] = useState<Record<string, boolean>>(
    Object.fromEntries(trip.members.map((m) => [m.id, true])),
  );
  const [enteringExpenseId, setEnteringExpenseId] = useState<string | null>(null);
  const prevExpenseCount = useRef(trip.expenses.length);

  useEffect(() => {
    if (trip.expenses.length > prevExpenseCount.current) {
      const newest = trip.expenses[trip.expenses.length - 1];
      if (newest) setEnteringExpenseId(newest.id);
    }
    prevExpenseCount.current = trip.expenses.length;
  }, [trip.expenses]);

  const submit = () => {
    const value = Number.parseFloat(amount);
    const participants = trip.members.map((m) => m.id).filter((id) => parts[id]);
    if (!desc.trim() || !(value > 0) || participants.length === 0) return;
    onAddExpense({
      description: desc.trim(),
      amount: Math.round(value),
      currency: expenseCurrency,
      payer,
      participants,
    });
    setDesc("");
    setAmount("");
    setOpen(false);
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
            <Button
              variant="brand"
              size="sm"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? tc("actions.close") : t("budget.addExpense")}
            </Button>
          </div>

          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)]",
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div
              className={cn("overflow-hidden", !open && "pointer-events-none")}
              aria-hidden={!open}
            >
              <div className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3.5">
              <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={t("budget.descPlaceholder")}
                  className="h-8"
                />
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t("budget.amountPlaceholder")}
                    className="h-8 min-w-0 flex-1"
                  />
                  <Select
                    items={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    value={expenseCurrency}
                    onValueChange={(value) =>
                      setExpenseCurrency((value as string) || currency)
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
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-xs font-medium text-muted-foreground">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-xs font-medium text-muted-foreground">
                  {t("budget.splitWith")}
                </span>
                {trip.members.map((m) => (
                  <MemberChoice
                    key={m.id}
                    member={m}
                    selected={!!parts[m.id]}
                    onClick={() =>
                      setParts((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                    }
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="primary" size="sm" onClick={submit}>
                  {t("budget.addExpense")}
                </Button>
              </div>
              </div>
            </div>
          </div>

          {[...trip.expenses].reverse().map((e) => {
            const m = memberOf(trip, e.payer);
            const expenseCurrencyForDisplay = e.currency || currency;
            return (
              <div
                key={e.id}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
                  enteringExpenseId === e.id && "wf-enter",
                )}
              >
                <Avatar
                  initials={m.initials}
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
                  size={30}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{e.description}</span>
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
                  initials={m.initials}
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
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
          <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3.5">
            <span className="font-heading text-base font-semibold tracking-tight">
              {t("budget.settleUp")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("budget.transfersClear", { count: budget.settlements.length })}
            </span>
          </div>
          {budget.settlements.map((s, i) => {
            const from = memberOf(trip, s.from);
            const to = memberOf(trip, s.to);
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 border-b border-border px-4 py-3.5 last:border-b-0"
              >
                <Avatar
                  initials={from.initials}
                  name={from.name}
                  bg={from.avatarBg}
                  fg={from.avatarFg}
                  size={30}
                />
                <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                  <span className="font-mono text-sm font-semibold tabular-nums text-corn-600">
                    {formatMoney(s.amount, currency)}
                  </span>
                  <svg
                    viewBox="0 0 120 8"
                    preserveAspectRatio="none"
                    className="block h-2 w-full text-corn-300"
                    aria-hidden="true"
                  >
                    <line
                      x1="0"
                      y1="4"
                      x2="112"
                      y2="4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <path d="M112 1l6 3-6 3z" fill="currentColor" />
                  </svg>
                </div>
                <Avatar
                  initials={to.initials}
                  name={to.name}
                  bg={to.avatarBg}
                  fg={to.avatarFg}
                  size={30}
                />
              </div>
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
        "transition-[background-color,color,border-color,scale] duration-150 active:scale-[0.96]",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <Avatar
        initials={member.initials}
        name={member.name}
        bg={member.avatarBg}
        fg={member.avatarFg}
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
