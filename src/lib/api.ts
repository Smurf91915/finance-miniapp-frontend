import {
  Category,
  Dashboard,
  Goal,
  GoalHistoryItem,
  GoalAnalytics,
  RecurringExpense,
  SpendingAnalytics,
  Subcategory,
  Transaction,
} from "./types";
import { getTelegramInitData } from "./telegram";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function extractErrorMessage(response: Response): Promise<string> {
  const detail = await response.text();
  if (!detail) {
    return `Request failed with status ${response.status}`;
  }

  try {
    const parsed = JSON.parse(detail) as { detail?: string };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // Fall through to raw response text.
  }

  return detail;
}

async function request<T>(
  method: ApiMethod,
  path: string,
  telegramId: number | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const initData = getTelegramInitData();

  if (initData) {
    headers["X-Telegram-Init-Data"] = initData;
  } else if (telegramId) {
    headers["X-Telegram-Id"] = String(telegramId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getDashboard: (telegramId: number | null) =>
    request<Dashboard>("GET", "/dashboard", telegramId),
  listTransactions: (telegramId: number | null) =>
    request<Transaction[]>("GET", "/transactions?limit=50", telegramId),
  listCategories: (telegramId: number | null) =>
    request<Category[]>("GET", "/categories", telegramId),
  createCategory: (
    telegramId: number | null,
    payload: {
      kind: string;
      name: string;
      sort_order?: number;
    },
  ) => request<Category>("POST", "/categories", telegramId, payload),
  updateCategory: (
    telegramId: number | null,
    categoryId: string,
    payload: {
      name?: string;
      is_archived?: boolean;
      sort_order?: number;
    },
  ) => request<Category>("PATCH", `/categories/${categoryId}`, telegramId, payload),
  createSubcategory: (
    telegramId: number | null,
    payload: {
      category_id: string;
      name: string;
      sort_order?: number;
    },
  ) => request<Subcategory>("POST", "/categories/subcategories", telegramId, payload),
  updateSubcategory: (
    telegramId: number | null,
    subcategoryId: string,
    payload: {
      name?: string;
      is_archived?: boolean;
      sort_order?: number;
    },
  ) =>
    request<Subcategory>(
      "PATCH",
      `/categories/subcategories/${subcategoryId}`,
      telegramId,
      payload,
    ),
  listGoals: (telegramId: number | null) =>
    request<Goal[]>("GET", "/goals", telegramId),
  createGoal: (
    telegramId: number | null,
    payload: {
      kind: string;
      name: string;
      target_amount_minor?: number | null;
      sort_order?: number;
    },
  ) => request<Goal>("POST", "/goals", telegramId, payload),
  getGoalHistory: (telegramId: number | null, goalId: string) =>
    request<GoalHistoryItem[]>(`GET`, `/goals/${goalId}/history`, telegramId),
  getSpendingAnalytics: (telegramId: number | null) =>
    request<SpendingAnalytics>("GET", "/analytics/spending", telegramId),
  getGoalsAnalytics: (telegramId: number | null) =>
    request<GoalAnalytics>("GET", "/analytics/goals", telegramId),
  listRecurringExpenses: (telegramId: number | null) =>
    request<RecurringExpense[]>("GET", "/recurring-expenses", telegramId),
  createExpense: (
    telegramId: number | null,
    payload: {
      amount_minor: number;
      currency: string;
      occurred_at: string;
      category_id: string;
      subcategory_id?: string | null;
      note?: string;
      source: string;
    },
  ) => request<Transaction>("POST", "/transactions/expense", telegramId, payload),
  createIncome: (
    telegramId: number | null,
    payload: {
      amount_minor: number;
      currency: string;
      occurred_at: string;
      note?: string;
      reserve_amount_minor?: number | null;
      source: string;
    },
  ) =>
    request<Transaction[]>("POST", "/transactions/income", telegramId, payload),
  createInvestment: (
    telegramId: number | null,
    payload: {
      amount_minor: number;
      currency: string;
      occurred_at: string;
      category_id: string;
      subcategory_id?: string | null;
      note?: string;
      source: string;
    },
  ) =>
    request<Transaction>("POST", "/transactions/investment", telegramId, payload),
  createRefund: (
    telegramId: number | null,
    transactionId: string,
    payload: {
      amount_minor: number;
      currency: string;
      occurred_at: string;
      note?: string;
      source: string;
    },
    ) =>
    request<Transaction>(
      "POST",
      `/transactions/${transactionId}/refund`,
      telegramId,
      payload,
    ),
  updateTransaction: (
    telegramId: number | null,
    transactionId: string,
    payload: {
      amount_minor?: number;
      occurred_at?: string;
      note?: string;
      category_id?: string | null;
      subcategory_id?: string | null;
      goal_id?: string | null;
    },
  ) =>
    request<Transaction>(
      "PATCH",
      `/transactions/${transactionId}`,
      telegramId,
      payload,
    ),
  deleteTransaction: (telegramId: number | null, transactionId: string) =>
    request<{ ok: boolean }>("DELETE", `/transactions/${transactionId}`, telegramId),
  allocateGoal: (
    telegramId: number | null,
    goalId: string,
    payload: {
      amount_minor: number;
      currency: string;
      occurred_at: string;
      note?: string;
      source: string;
    },
  ) =>
    request<Transaction>(
      "POST",
      `/transactions/goals/${goalId}/allocate`,
      telegramId,
      payload,
    ),
  createRecurringExpense: (
    telegramId: number | null,
    payload: {
      name: string;
      category_id: string;
      subcategory_id?: string | null;
      kind: string;
      cadence: string;
      expected_amount_minor?: number | null;
      day_of_month?: number | null;
      note?: string;
    },
  ) =>
    request<RecurringExpense>(
      "POST",
      "/recurring-expenses",
      telegramId,
      payload,
    ),
  updateRecurringExpense: (
    telegramId: number | null,
    recurringId: string,
    payload: {
      name?: string;
      category_id?: string | null;
      subcategory_id?: string | null;
      kind?: string;
      cadence?: string;
      expected_amount_minor?: number | null;
      day_of_month?: number | null;
      is_active?: boolean;
      note?: string | null;
    },
  ) =>
    request<RecurringExpense>(
      "PATCH",
      `/recurring-expenses/${recurringId}`,
      telegramId,
      payload,
    ),
};
