import {
  Category,
  Dashboard,
  Goal,
  GoalAnalytics,
  RecurringExpense,
  SpendingAnalytics,
  Transaction,
} from "./types";
import { getTelegramInitData } from "./telegram";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

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
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
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
  listGoals: (telegramId: number | null) =>
    request<Goal[]>("GET", "/goals", telegramId),
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
};
