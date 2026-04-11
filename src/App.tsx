import { useEffect, useState, startTransition } from "react";

import { BottomNav } from "./components/BottomNav";
import { MetricCard } from "./components/MetricCard";
import { SectionCard } from "./components/SectionCard";
import { api } from "./lib/api";
import { getTelegramUserId, initializeTelegramWebApp } from "./lib/telegram";
import type {
  Category,
  Dashboard,
  Goal,
  GoalAnalytics,
  RecurringExpense,
  SpendingAnalytics,
  Transaction,
  TransactionType,
} from "./lib/types";

type TabKey = "home" | "add" | "history" | "analytics" | "goals";
type AddMode = "expense" | "income" | "investment" | "goal_allocation";

interface AddFormState {
  mode: AddMode;
  amount: string;
  note: string;
  categoryId: string;
  subcategoryId: string;
  reserveAmount: string;
  goalId: string;
  recurringName: string;
  recurringKind: "fixed" | "variable";
  recurringCadence: "monthly" | "yearly" | "custom";
  recurringDay: string;
}

const defaultFormState: AddFormState = {
  mode: "expense",
  amount: "",
  note: "",
  categoryId: "",
  subcategoryId: "",
  reserveAmount: "",
  goalId: "",
  recurringName: "",
  recurringKind: "fixed",
  recurringCadence: "monthly",
  recurringDay: "",
};

function formatMinor(amountMinor: number): string {
  const amount = amountMinor / 100;
  return amount.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
}

function toMinor(input: string): number {
  const normalized = input.replace(",", ".").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * 100);
}

function friendlyType(type: TransactionType): string {
  switch (type) {
    case "income":
      return "Доход";
    case "expense":
      return "Расход";
    case "investment":
      return "Инвестиция";
    case "goal_allocation":
      return "Накопление";
    case "refund":
      return "Возврат";
    default:
      return type;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalAnalytics, setGoalAnalytics] = useState<GoalAnalytics | null>(null);
  const [spending, setSpending] = useState<SpendingAnalytics | null>(null);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [form, setForm] = useState<AddFormState>(defaultFormState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    initializeTelegramWebApp();
    setTelegramId(getTelegramUserId());
  }, []);

  async function reloadData(currentTelegramId: number | null) {
    setLoading(true);
    setError(null);

    try {
      const [
        dashboardData,
        transactionsData,
        categoriesData,
        goalsData,
        spendingData,
        goalsAnalyticsData,
        recurringData,
      ] = await Promise.all([
        api.getDashboard(currentTelegramId),
        api.listTransactions(currentTelegramId),
        api.listCategories(currentTelegramId),
        api.listGoals(currentTelegramId),
        api.getSpendingAnalytics(currentTelegramId),
        api.getGoalsAnalytics(currentTelegramId),
        api.listRecurringExpenses(currentTelegramId),
      ]);

      startTransition(() => {
        setDashboard(dashboardData);
        setTransactions(transactionsData);
        setCategories(categoriesData);
        setGoals(goalsData);
        setSpending(spendingData);
        setGoalAnalytics(goalsAnalyticsData);
        setRecurring(recurringData);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadData(telegramId);
  }, [telegramId]);

  useEffect(() => {
    if (!form.goalId && goals.length > 0) {
      setForm((current) => ({
        ...current,
        goalId: goals[0].id,
      }));
    }
  }, [goals, form.goalId]);

  const availableExpenseCategories = categories.filter(
    (category) => category.kind === "expense" && !category.is_archived,
  );
  const availableInvestmentCategories = categories.filter(
    (category) => category.kind === "investment" && !category.is_archived,
  );
  const selectedCategory =
    categories.find((category) => category.id === form.categoryId) ?? null;
  const selectedSubcategories =
    selectedCategory?.subcategories.filter((subcategory) => !subcategory.is_archived) ?? [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const amountMinor = toMinor(form.amount);
    if (!amountMinor) {
      setError("Укажи сумму больше нуля.");
      setSubmitting(false);
      return;
    }
    const occurredAt = new Date().toISOString();

    try {
      if (form.mode === "expense") {
        if (!form.categoryId) {
          throw new Error("Выбери категорию расхода.");
        }
        await api.createExpense(telegramId, {
          amount_minor: amountMinor,
          currency: "RUB",
          occurred_at: occurredAt,
          category_id: form.categoryId,
          subcategory_id: form.subcategoryId || null,
          note: form.note,
          source: "mini_app",
        });
        setSuccess("Расход записан.");
      }

      if (form.mode === "income") {
        const reserveMinor = form.reserveAmount ? toMinor(form.reserveAmount) : null;
        await api.createIncome(telegramId, {
          amount_minor: amountMinor,
          currency: "RUB",
          occurred_at: occurredAt,
          note: form.note,
          reserve_amount_minor: reserveMinor,
          source: "mini_app",
        });
        setSuccess("Доход записан.");
      }

      if (form.mode === "investment") {
        if (!form.categoryId) {
          throw new Error("Выбери инвестиционную категорию.");
        }
        await api.createInvestment(telegramId, {
          amount_minor: amountMinor,
          currency: "RUB",
          occurred_at: occurredAt,
          category_id: form.categoryId,
          subcategory_id: form.subcategoryId || null,
          note: form.note,
          source: "mini_app",
        });
        setSuccess("Инвестиция записана.");
      }

      if (form.mode === "goal_allocation") {
        if (!form.goalId) {
          throw new Error("Выбери цель.");
        }
        await api.allocateGoal(telegramId, form.goalId, {
          amount_minor: amountMinor,
          currency: "RUB",
          occurred_at: occurredAt,
          note: form.note,
          source: "mini_app",
        });
        setSuccess("Пополнение цели записано.");
      }

      setForm({
        ...defaultFormState,
        goalId: goals[0]?.id ?? "",
      });
      await reloadData(telegramId);
      setActiveTab("home");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось сохранить операцию.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecurringCreate() {
    if (!form.recurringName || !form.categoryId) {
      setError("Для регулярной траты нужны название и категория.");
      return;
    }

    try {
      await api.createRecurringExpense(telegramId, {
        name: form.recurringName,
        category_id: form.categoryId,
        subcategory_id: form.subcategoryId || null,
        kind: form.recurringKind,
        cadence: form.recurringCadence,
        expected_amount_minor: form.amount ? toMinor(form.amount) : null,
        day_of_month: form.recurringDay ? Number(form.recurringDay) : null,
        note: form.note,
      });
      setSuccess("Регулярная трата добавлена.");
      await reloadData(telegramId);
    } catch (recurringError) {
      setError(
        recurringError instanceof Error
          ? recurringError.message
          : "Не удалось создать регулярную трату.",
      );
    }
  }

  const currentAddCategories =
    form.mode === "investment" ? availableInvestmentCategories : availableExpenseCategories;

  const quickGoalPreview = goalAnalytics?.goals ?? [];

  return (
    <div className="app-shell">
      <main className="app-shell__content">
        <header className="hero">
          <div>
            <span className="hero__eyebrow">Finance Mini App</span>
            <h1 className="hero__title">Порядок в деньгах без тяжелой бухгалтерии</h1>
            <p className="hero__subtitle">
              Быстрые записи, честная сводка и накопления отдельно от бытовых трат.
            </p>
          </div>
          <div className="hero__status">
            <span className="status-dot" />
            {telegramId ? `Telegram ID: ${telegramId}` : "Browser mode"}
          </div>
        </header>

        {error ? <div className="banner banner--error">{error}</div> : null}
        {success ? <div className="banner banner--success">{success}</div> : null}

        {loading ? (
          <div className="loading-card">Загружаю дашборд и операции…</div>
        ) : null}

        {!loading && activeTab === "home" && dashboard ? (
          <div className="stack">
            <section className="metric-grid">
              <MetricCard
                label="Доступно сейчас"
                value={formatMinor(dashboard.available_minor)}
                tone="accent"
              />
              <MetricCard
                label="Доходы"
                value={formatMinor(dashboard.income_total_minor)}
                tone="success"
              />
              <MetricCard
                label="Расходы"
                value={formatMinor(dashboard.expense_total_minor)}
                tone="danger"
              />
              <MetricCard
                label="Накопления"
                value={formatMinor(dashboard.goal_total_minor)}
              />
            </section>

            <SectionCard
              eyebrow="Быстрые действия"
              title="С чем хочешь поработать сейчас?"
            >
              <div className="action-grid">
                <button type="button" className="action-pill" onClick={() => {
                  setForm((current) => ({
                    ...defaultFormState,
                    mode: "expense",
                    goalId: current.goalId || goals[0]?.id || "",
                  }));
                  setActiveTab("add");
                }}>
                  Расход
                </button>
                <button type="button" className="action-pill" onClick={() => {
                  setForm((current) => ({
                    ...defaultFormState,
                    mode: "income",
                    goalId: current.goalId || goals[0]?.id || "",
                  }));
                  setActiveTab("add");
                }}>
                  Доход
                </button>
                <button type="button" className="action-pill" onClick={() => {
                  setForm((current) => ({
                    ...defaultFormState,
                    mode: "goal_allocation",
                    goalId: current.goalId || goals[0]?.id || "",
                  }));
                  setActiveTab("add");
                }}>
                  Вклад
                </button>
                <button type="button" className="action-pill" onClick={() => {
                  setForm((current) => ({
                    ...defaultFormState,
                    mode: "investment",
                    goalId: current.goalId || goals[0]?.id || "",
                  }));
                  setActiveTab("add");
                }}>
                  Облигации
                </button>
              </div>
            </SectionCard>

            <SectionCard eyebrow="Месяц" title="Последние операции">
              <div className="transaction-list">
                {dashboard.recent_transactions.map((transaction) => (
                  <article className="transaction-row" key={transaction.id}>
                    <div>
                      <div className="transaction-row__title">
                        {transaction.subcategory_name ||
                          transaction.category_name ||
                          transaction.goal_name ||
                          friendlyType(transaction.type)}
                      </div>
                      <div className="transaction-row__meta">
                        {new Date(transaction.occurred_at).toLocaleDateString("ru-RU")} ·{" "}
                        {friendlyType(transaction.type)}
                      </div>
                    </div>
                    <strong>{formatMinor(transaction.amount_minor)}</strong>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Накопления" title="Цели на ладони">
              <div className="goal-grid">
                {quickGoalPreview.map((goal) => (
                  <article key={goal.goal_id} className="goal-tile">
                    <span>{goal.goal_name}</span>
                    <strong>{formatMinor(goal.amount_minor)}</strong>
                  </article>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {!loading && activeTab === "add" ? (
          <div className="stack">
            <SectionCard eyebrow="Новая запись" title="Добавить движение денег">
              <form className="finance-form" onSubmit={handleSubmit}>
                <div className="mode-switch">
                  {[
                    ["expense", "Расход"],
                    ["income", "Доход"],
                    ["goal_allocation", "Накопление"],
                    ["investment", "Инвестиция"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`mode-switch__item ${form.mode === value ? "is-active" : ""}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...defaultFormState,
                          mode: value as AddMode,
                          goalId: current.goalId || goals[0]?.id || "",
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Сумма</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Например, 320"
                    value={form.amount}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, amount: event.target.value }))
                    }
                  />
                </label>

                {form.mode === "expense" || form.mode === "investment" ? (
                  <>
                    <label className="field">
                      <span>Категория</span>
                      <select
                        value={form.categoryId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                            subcategoryId: "",
                          }))
                        }
                      >
                        <option value="">Выбери категорию</option>
                        {currentAddCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedSubcategories.length > 0 ? (
                      <label className="field">
                        <span>Подкатегория</span>
                        <select
                          value={form.subcategoryId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              subcategoryId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Без подкатегории</option>
                          {selectedSubcategories.map((subcategory) => (
                            <option key={subcategory.id} value={subcategory.id}>
                              {subcategory.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}

                {form.mode === "goal_allocation" ? (
                  <label className="field">
                    <span>Цель</span>
                    <select
                      value={form.goalId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, goalId: event.target.value }))
                      }
                    >
                      <option value="">Выбери цель</option>
                      {goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {form.mode === "income" ? (
                  <label className="field">
                    <span>Сколько отправила в неприкосновенный запас?</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="Можно оставить пустым"
                      value={form.reserveAmount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reserveAmount: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}

                <label className="field">
                  <span>Комментарий</span>
                  <textarea
                    rows={3}
                    placeholder="Например, зарплата за март или кофе перед театром"
                    value={form.note}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, note: event.target.value }))
                    }
                  />
                </label>

                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? "Сохраняю…" : "Сохранить запись"}
                </button>
              </form>
            </SectionCard>

            {form.mode === "expense" ? (
              <SectionCard eyebrow="Регулярные платежи" title="Сделать эту трату регулярной">
                <div className="finance-form">
                  <label className="field">
                    <span>Название</span>
                    <input
                      type="text"
                      placeholder="Например, аренда квартиры"
                      value={form.recurringName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recurringName: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="inline-grid">
                    <label className="field">
                      <span>Тип</span>
                      <select
                        value={form.recurringKind}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recurringKind: event.target.value as "fixed" | "variable",
                          }))
                        }
                      >
                        <option value="fixed">Фиксированная</option>
                        <option value="variable">Плавающая</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Периодичность</span>
                      <select
                        value={form.recurringCadence}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recurringCadence: event.target.value as
                              | "monthly"
                              | "yearly"
                              | "custom",
                          }))
                        }
                      >
                        <option value="monthly">Ежемесячно</option>
                        <option value="yearly">Ежегодно</option>
                        <option value="custom">Своя</option>
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>День месяца</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Например, 5"
                      value={form.recurringDay}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recurringDay: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleRecurringCreate()}
                  >
                    Добавить в регулярные
                  </button>
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : null}

        {!loading && activeTab === "history" ? (
          <div className="stack">
            <SectionCard eyebrow="Журнал" title="История операций">
              <div className="transaction-list">
                {transactions.map((transaction) => (
                  <article className="transaction-row" key={transaction.id}>
                    <div>
                      <div className="transaction-row__title">
                        {transaction.subcategory_name ||
                          transaction.category_name ||
                          transaction.goal_name ||
                          friendlyType(transaction.type)}
                      </div>
                      <div className="transaction-row__meta">
                        {new Date(transaction.occurred_at).toLocaleString("ru-RU")} ·{" "}
                        {friendlyType(transaction.type)}
                      </div>
                      {transaction.note ? (
                        <div className="transaction-row__note">{transaction.note}</div>
                      ) : null}
                    </div>
                    <strong>{formatMinor(transaction.amount_minor)}</strong>
                  </article>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {!loading && activeTab === "analytics" && spending ? (
          <div className="stack">
            <SectionCard eyebrow="Куда ушли деньги" title="Картина месяца">
              <div className="metric-grid metric-grid--compact">
                <MetricCard
                  label="Бытовые расходы"
                  value={formatMinor(spending.expense_total_minor)}
                  tone="danger"
                />
                <MetricCard
                  label="Инвестиции"
                  value={formatMinor(spending.investment_total_minor)}
                />
                <MetricCard
                  label="Накопления"
                  value={formatMinor(spending.goal_total_minor)}
                />
                <MetricCard
                  label="Среднее в день"
                  value={formatMinor(spending.average_daily_expense_minor)}
                />
              </div>

              <div className="category-bars">
                {spending.categories.map((item) => (
                  <article key={item.category_id} className="category-bar">
                    <div className="category-bar__head">
                      <span>{item.category_name}</span>
                      <strong>
                        {formatMinor(item.amount_minor)} · {item.percent}%
                      </strong>
                    </div>
                    <div className="category-bar__track">
                      <div
                        className="category-bar__fill"
                        style={{ width: `${Math.max(item.percent, 4)}%` }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Обязательная база" title="Регулярные траты">
              <div className="recurring-list">
                {recurring.map((item) => (
                  <article key={item.id} className="recurring-item">
                    <div>
                      <strong>{item.name}</strong>
                      <div className="transaction-row__meta">
                        {item.kind === "fixed" ? "Фиксированная" : "Плавающая"} ·{" "}
                        {item.cadence}
                        {item.day_of_month ? ` · ${item.day_of_month} число` : ""}
                      </div>
                    </div>
                    <span>
                      {item.expected_amount_minor
                        ? formatMinor(item.expected_amount_minor)
                        : "Без суммы"}
                    </span>
                  </article>
                ))}
                {recurring.length === 0 ? (
                  <div className="empty-state">
                    Регулярные траты пока не заведены. Их можно добавить на вкладке
                    “Добавить”.
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {!loading && activeTab === "goals" ? (
          <div className="stack">
            <SectionCard eyebrow="Накопления" title="Цели и резервы">
              <div className="goal-grid">
                {goals.map((goal) => (
                  <article key={goal.id} className="goal-tile goal-tile--large">
                    <span>{goal.name}</span>
                    <strong>{formatMinor(goal.balance_minor)}</strong>
                    <small>{goal.kind === "reserve" ? "Финансовая подушка" : "Накопительный контур"}</small>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Прогресс" title="Распределение по целям">
              <div className="goal-progress-list">
                {quickGoalPreview.map((goal) => (
                  <article key={goal.goal_id} className="goal-progress">
                    <div className="goal-progress__head">
                      <span>{goal.goal_name}</span>
                      <strong>{formatMinor(goal.amount_minor)}</strong>
                    </div>
                    <div className="category-bar__track">
                      <div
                        className="category-bar__fill category-bar__fill--warm"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              8,
                              dashboard
                                ? (goal.amount_minor /
                                    Math.max(dashboard.income_total_minor, 1)) *
                                    100
                                : 8,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
