export type TransactionType =
  | "income"
  | "expense"
  | "investment"
  | "goal_allocation"
  | "refund";

export type CategoryKind = "expense" | "investment";

export interface Subcategory {
  id: string;
  name: string;
  is_archived: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  is_archived: boolean;
  sort_order: number;
  subcategories: Subcategory[];
}

export interface Goal {
  id: string;
  kind: string;
  name: string;
  target_amount_minor: number | null;
  is_archived: boolean;
  sort_order: number;
  balance_minor: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount_minor: number;
  currency: string;
  occurred_at: string;
  note: string | null;
  source: string;
  category_id: string | null;
  subcategory_id: string | null;
  goal_id: string | null;
  linked_transaction_id: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  goal_name: string | null;
}

export interface Dashboard {
  period: {
    start: string;
    end: string;
  };
  income_total_minor: number;
  expense_total_minor: number;
  investment_total_minor: number;
  goal_total_minor: number;
  refund_total_minor: number;
  available_minor: number;
  recent_transactions: Transaction[];
}

export interface SpendingCategory {
  category_id: string;
  category_name: string;
  amount_minor: number;
  percent: number;
}

export interface SpendingAnalytics {
  expense_total_minor: number;
  investment_total_minor: number;
  goal_total_minor: number;
  average_daily_expense_minor: number;
  transaction_count: number;
  categories: SpendingCategory[];
}

export interface GoalAnalyticsItem {
  goal_id: string;
  goal_name: string;
  amount_minor: number;
}

export interface GoalAnalytics {
  goals: GoalAnalyticsItem[];
}

export interface RecurringExpense {
  id: string;
  name: string;
  category_id: string;
  subcategory_id: string | null;
  kind: "fixed" | "variable";
  cadence: "monthly" | "yearly" | "custom";
  expected_amount_minor: number | null;
  day_of_month: number | null;
  is_active: boolean;
  note: string | null;
}
