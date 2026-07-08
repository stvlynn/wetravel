import type { StopCategory } from "@/entities/stop";

export interface Expense {
  id: string;
  description: string;
  payer: string;
  amount: number;
  /** ISO currency code for `amount`. Empty string means "use the trip currency". */
  currency: string;
  /** Expense type, reusing the shared stop categories. Defaults to "Plan". */
  category: StopCategory;
  participants: string[];
  whenLabel: string;
}

export interface Balance {
  memberId: string;
  paid: number;
  share: number;
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface Budget {
  total: number;
  perPerson: number;
  balances: Balance[];
  settlements: Settlement[];
}
