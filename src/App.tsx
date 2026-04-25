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
  GoalHistoryItem,
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

interface RecurringEditFormState {
  name: string;
  categoryId: string;
  subcategoryId: string;
  kind: "fixed" | "variable";
  cadence: "monthly" | "yearly" | "custom";
  expectedAmount: string;
  dayOfMonth: string;
  note: string;
}

interface GoalCreateFormState {
  name: string;
  kind: "reserve" | "deposit" | "custom";
  targetAmount: string;
  sortOrder: string;
}

interface CategoryCreateFormState {
  kind: "expense" | "investment";
  name: string;
  sortOrder: string;
}

interface SubcategoryCreateFormState {
  categoryId: string;
  name: string;
  sortOrder: string;
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

const defaultGoalFormState: GoalCreateFormState = {
  name: "",
  kind: "custom",
  targetAmount: "",
  sortOrder: "0",
};

const defaultCategoryFormState: CategoryCreateFormState = {
  kind: "expense",
  name: "",
  sortOrder: "0",
};

const defaultSubcategoryFormState: SubcategoryCreateFormState = {
  categoryId: "",
  name: "",
  sortOrder: "0",
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

function friendlyCadence(cadence: string): string {
  switch (cadence) {
    case "monthly":
      return "Ежемесячно";
    case "yearly":
      return "Ежегодно";
    case "custom":
      return "Своя периодичность";
    default:
      return cadence;
  }
}

function friendlyGoalKind(kind: string): string {
  switch (kind) {
    case "reserve":
      return "Финансовая подушка";
    case "deposit":
      return "Накопительный контур";
    case "custom":
      return "Своя цель";
    default:
      return kind;
  }
}

function transactionLabel(transaction: Transaction): string {
  return (
    transaction.subcategory_name ||
    transaction.category_name ||
    transaction.goal_name ||
    friendlyType(transaction.type)
  );
}

function refundableRemainingMinor(
  transaction: Transaction,
  allTransactions: Transaction[],
): number {
  if (transaction.type !== "expense" && transaction.type !== "investment") {
    return 0;
  }

  const refundedMinor = allTransactions
    .filter(
      (item) =>
        item.type === "refund" && item.linked_transaction_id === transaction.id,
    )
    .reduce((sum, item) => sum + item.amount_minor, 0);

  return Math.max(transaction.amount_minor - refundedMinor, 0);
}

function hasLinkedTransactions(
  transaction: Transaction,
  allTransactions: Transaction[],
): boolean {
  return allTransactions.some(
    (item) => item.linked_transaction_id === transaction.id,
  );
}

function editableModeForTransaction(transaction: Transaction): AddMode | null {
  switch (transaction.type) {
    case "expense":
      return "expense";
    case "income":
      return "income";
    case "investment":
      return "investment";
    case "goal_allocation":
      return "goal_allocation";
    default:
      return null;
  }
}

function canEditTransaction(
  transaction: Transaction,
  allTransactions: Transaction[],
): boolean {
  return (
    editableModeForTransaction(transaction) !== null &&
    !hasLinkedTransactions(transaction, allTransactions)
  );
}

function canDeleteTransaction(
  transaction: Transaction,
  allTransactions: Transaction[],
): boolean {
  return !hasLinkedTransactions(transaction, allTransactions);
}

function toInputAmount(amountMinor: number): string {
  return String(amountMinor / 100);
}

function recurringEditStateFromItem(item: RecurringExpense): RecurringEditFormState {
  return {
    name: item.name,
    categoryId: item.category_id,
    subcategoryId: item.subcategory_id ?? "",
    kind: item.kind,
    cadence: item.cadence,
    expectedAmount: item.expected_amount_minor
      ? toInputAmount(item.expected_amount_minor)
      : "",
    dayOfMonth: item.day_of_month ? String(item.day_of_month) : "",
    note: item.note ?? "",
  };
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundDraftId, setRefundDraftId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recurringSubmittingId, setRecurringSubmittingId] = useState<string | null>(null);
  const [recurringForm, setRecurringForm] = useState<RecurringEditFormState | null>(null);
  const [showGoalCreateForm, setShowGoalCreateForm] = useState(false);
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const [goalForm, setGoalForm] = useState<GoalCreateFormState>(defaultGoalFormState);
  const [goalHistoryId, setGoalHistoryId] = useState<string | null>(null);
  const [goalHistoryItems, setGoalHistoryItems] = useState<GoalHistoryItem[]>([]);
  const [goalHistoryLoading, setGoalHistoryLoading] = useState(false);
  const [categoryForm, setCategoryForm] =
    useState<CategoryCreateFormState>(defaultCategoryFormState);
  const [subcategoryForm, setSubcategoryForm] =
    useState<SubcategoryCreateFormState>(defaultSubcategoryFormState);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [subcategorySubmitting, setSubcategorySubmitting] = useState(false);
  const [categoryUpdatingId, setCategoryUpdatingId] = useState<string | null>(null);
  const [subcategoryUpdatingId, setSubcategoryUpdatingId] = useState<string | null>(null);
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

  const expenseCategories = categories.filter(
    (category) => category.kind === "expense",
  );
  const investmentCategories = categories.filter(
    (category) => category.kind === "investment",
  );
  const availableExpenseCategories = expenseCategories.filter(
    (category) => category.kind === "expense" && !category.is_archived,
  );
  const availableInvestmentCategories = investmentCategories.filter(
    (category) => !category.is_archived,
  );
  const selectedCategory =
    categories.find((category) => category.id === form.categoryId) ?? null;
  const selectedSubcategories =
    selectedCategory?.subcategories.filter((subcategory) => !subcategory.is_archived) ?? [];
  const editingTransaction = editingTransactionId
    ? transactions.find((transaction) => transaction.id === editingTransactionId) ?? null
    : null;
  const recurringEditCategory =
    recurringForm && recurringForm.categoryId
      ? categories.find((category) => category.id === recurringForm.categoryId) ?? null
      : null;
  const recurringEditSubcategories =
    recurringEditCategory?.subcategories.filter((subcategory) => !subcategory.is_archived) ?? [];
  const availableSubcategoryCategories = categories.filter(
    (category) => !category.is_archived,
  );
  const categoryGroups = [
    {
      key: "expense",
      title: "Расходы",
      items: expenseCategories,
    },
    {
      key: "investment",
      title: "Инвестиции",
      items: investmentCategories,
    },
  ] as const;

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
    const occurredAt = editingTransaction?.occurred_at ?? new Date().toISOString();

    try {
      if (editingTransaction) {
        if (form.mode === "expense" || form.mode === "investment") {
          if (!form.categoryId) {
            throw new Error("Выбери категорию.");
          }
        }

        if (form.mode === "goal_allocation" && !form.goalId) {
          throw new Error("Выбери цель.");
        }

        await api.updateTransaction(telegramId, editingTransaction.id, {
          amount_minor: amountMinor,
          occurred_at: occurredAt,
          note: form.note,
          category_id:
            form.mode === "expense" || form.mode === "investment"
              ? form.categoryId
              : undefined,
          subcategory_id:
            form.mode === "expense" || form.mode === "investment"
              ? form.subcategoryId || null
              : undefined,
          goal_id: form.mode === "goal_allocation" ? form.goalId : undefined,
        });
        setSuccess("Операция обновлена.");
      } else if (form.mode === "expense") {
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

      if (!editingTransaction && form.mode === "income") {
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

      if (!editingTransaction && form.mode === "investment") {
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

      if (!editingTransaction && form.mode === "goal_allocation") {
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
      setEditingTransactionId(null);
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

  function startGoalCreate() {
    setError(null);
    setSuccess(null);
    setShowGoalCreateForm(true);
  }

  function cancelGoalCreate() {
    setShowGoalCreateForm(false);
    setGoalForm(defaultGoalFormState);
  }

  async function handleGoalCreate() {
    if (!goalForm.name.trim()) {
      setError("Укажи название цели.");
      return;
    }

    let targetAmountMinor: number | null = null;
    if (goalForm.targetAmount.trim()) {
      targetAmountMinor = toMinor(goalForm.targetAmount);
      if (!targetAmountMinor) {
        setError("Целевая сумма должна быть больше нуля.");
        return;
      }
    }

    const sortOrder = Number(goalForm.sortOrder || "0");
    if (!Number.isInteger(sortOrder)) {
      setError("Порядок должен быть целым числом.");
      return;
    }

    setError(null);
    setSuccess(null);
    setGoalSubmitting(true);

    try {
      await api.createGoal(telegramId, {
        name: goalForm.name.trim(),
        kind: goalForm.kind,
        target_amount_minor: targetAmountMinor,
        sort_order: sortOrder,
      });
      setSuccess("Цель создана.");
      cancelGoalCreate();
      await reloadData(telegramId);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать цель.",
      );
    } finally {
      setGoalSubmitting(false);
    }
  }

  function startGoalAllocation(goal: Goal) {
    setEditingTransactionId(null);
    setError(null);
    setSuccess(null);
    setForm({
      ...defaultFormState,
      mode: "goal_allocation",
      goalId: goal.id,
    });
    setActiveTab("add");
  }

  async function openGoalHistory(goal: Goal) {
    if (goalHistoryId === goal.id) {
      setGoalHistoryId(null);
      setGoalHistoryItems([]);
      return;
    }

    setError(null);
    setSuccess(null);
    setGoalHistoryId(goal.id);
    setGoalHistoryLoading(true);

    try {
      const items = await api.getGoalHistory(telegramId, goal.id);
      setGoalHistoryItems(items);
    } catch (historyError) {
      setGoalHistoryId(null);
      setGoalHistoryItems([]);
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Не удалось загрузить историю цели.",
      );
    } finally {
      setGoalHistoryLoading(false);
    }
  }

  async function handleCategoryCreate() {
    if (!categoryForm.name.trim()) {
      setError("Укажи название категории.");
      return;
    }

    const sortOrder = Number(categoryForm.sortOrder || "0");
    if (!Number.isInteger(sortOrder)) {
      setError("Порядок категории должен быть целым числом.");
      return;
    }

    setError(null);
    setSuccess(null);
    setCategorySubmitting(true);

    try {
      const created = await api.createCategory(telegramId, {
        kind: categoryForm.kind,
        name: categoryForm.name.trim(),
        sort_order: sortOrder,
      });
      setCategoryForm({
        ...defaultCategoryFormState,
        kind: categoryForm.kind,
      });
      setSubcategoryForm((current) => ({
        ...current,
        categoryId: current.categoryId || created.id,
      }));
      setSuccess("Категория создана.");
      await reloadData(telegramId);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать категорию.",
      );
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleSubcategoryCreate() {
    if (!subcategoryForm.categoryId) {
      setError("Выбери категорию для подкатегории.");
      return;
    }

    if (!subcategoryForm.name.trim()) {
      setError("Укажи название подкатегории.");
      return;
    }

    const sortOrder = Number(subcategoryForm.sortOrder || "0");
    if (!Number.isInteger(sortOrder)) {
      setError("Порядок подкатегории должен быть целым числом.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSubcategorySubmitting(true);

    try {
      await api.createSubcategory(telegramId, {
        category_id: subcategoryForm.categoryId,
        name: subcategoryForm.name.trim(),
        sort_order: sortOrder,
      });
      setSubcategoryForm((current) => ({
        ...defaultSubcategoryFormState,
        categoryId: current.categoryId,
      }));
      setSuccess("Подкатегория создана.");
      await reloadData(telegramId);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать подкатегорию.",
      );
    } finally {
      setSubcategorySubmitting(false);
    }
  }

  async function handleCategoryArchiveToggle(category: Category) {
    setError(null);
    setSuccess(null);
    setCategoryUpdatingId(category.id);

    try {
      await api.updateCategory(telegramId, category.id, {
        is_archived: !category.is_archived,
      });
      setSuccess(
        category.is_archived
          ? "Категория возвращена в активные."
          : "Категория отправлена в архив.",
      );
      await reloadData(telegramId);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Не удалось изменить статус категории.",
      );
    } finally {
      setCategoryUpdatingId(null);
    }
  }

  async function handleSubcategoryArchiveToggle(
    subcategoryId: string,
    isArchived: boolean,
  ) {
    setError(null);
    setSuccess(null);
    setSubcategoryUpdatingId(subcategoryId);

    try {
      await api.updateSubcategory(telegramId, subcategoryId, {
        is_archived: !isArchived,
      });
      setSuccess(
        isArchived
          ? "Подкатегория возвращена в активные."
          : "Подкатегория отправлена в архив.",
      );
      await reloadData(telegramId);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Не удалось изменить статус подкатегории.",
      );
    } finally {
      setSubcategoryUpdatingId(null);
    }
  }

  function startRecurringEdit(item: RecurringExpense) {
    setError(null);
    setSuccess(null);
    setEditingRecurringId(item.id);
    setRecurringForm(recurringEditStateFromItem(item));
  }

  function cancelRecurringEdit() {
    setEditingRecurringId(null);
    setRecurringForm(null);
  }

  async function handleRecurringUpdate(item: RecurringExpense) {
    if (!recurringForm) {
      return;
    }

    if (!recurringForm.name.trim()) {
      setError("Укажи название регулярной траты.");
      return;
    }

    if (!recurringForm.categoryId) {
      setError("Выбери категорию регулярной траты.");
      return;
    }

    let expectedAmountMinor: number | null = null;
    if (recurringForm.expectedAmount.trim()) {
      expectedAmountMinor = toMinor(recurringForm.expectedAmount);
      if (!expectedAmountMinor) {
        setError("Сумма регулярной траты должна быть больше нуля.");
        return;
      }
    }

    let dayOfMonth: number | null = null;
    if (recurringForm.dayOfMonth.trim()) {
      dayOfMonth = Number(recurringForm.dayOfMonth);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        setError("День месяца должен быть числом от 1 до 31.");
        return;
      }
    }

    setError(null);
    setSuccess(null);
    setRecurringSubmittingId(item.id);

    try {
      await api.updateRecurringExpense(telegramId, item.id, {
        name: recurringForm.name.trim(),
        category_id: recurringForm.categoryId,
        subcategory_id: recurringForm.subcategoryId || null,
        kind: recurringForm.kind,
        cadence: recurringForm.cadence,
        expected_amount_minor: expectedAmountMinor,
        day_of_month: dayOfMonth,
        note: recurringForm.note.trim() ? recurringForm.note.trim() : null,
      });
      setSuccess("Регулярная трата обновлена.");
      cancelRecurringEdit();
      await reloadData(telegramId);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Не удалось обновить регулярную трату.",
      );
    } finally {
      setRecurringSubmittingId(null);
    }
  }

  async function handleRecurringToggle(item: RecurringExpense) {
    setError(null);
    setSuccess(null);
    setRecurringSubmittingId(item.id);

    try {
      await api.updateRecurringExpense(telegramId, item.id, {
        is_active: !item.is_active,
      });
      if (editingRecurringId === item.id) {
        cancelRecurringEdit();
      }
      setSuccess(item.is_active ? "Регулярная трата поставлена на паузу." : "Регулярная трата снова активна.");
      await reloadData(telegramId);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Не удалось изменить статус регулярной траты.",
      );
    } finally {
      setRecurringSubmittingId(null);
    }
  }

  function startRefund(transaction: Transaction) {
    const remainingMinor = refundableRemainingMinor(transaction, transactions);
    if (!remainingMinor) {
      setError("Для этой операции больше нечего возвращать.");
      return;
    }

    setError(null);
    setSuccess(null);
    setRefundDraftId(transaction.id);
    setRefundAmount(toInputAmount(remainingMinor));
  }

  function cancelRefund() {
    setRefundDraftId(null);
    setRefundAmount("");
  }

  async function handleRefund(transaction: Transaction) {
    const remainingMinor = refundableRemainingMinor(transaction, transactions);
    if (!remainingMinor) {
      setError("Для этой операции больше нечего возвращать.");
      return;
    }

    const amountMinor = toMinor(refundAmount);
    if (!amountMinor) {
      setError("Укажи сумму возврата больше нуля.");
      return;
    }

    if (amountMinor > remainingMinor) {
      setError(
        `Можно вернуть не больше ${formatMinor(remainingMinor)} по этой операции.`,
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setRefundingId(transaction.id);

    try {
      await api.createRefund(telegramId, transaction.id, {
        amount_minor: amountMinor,
        currency: transaction.currency,
        occurred_at: new Date().toISOString(),
        note: transaction.note
          ? `Возврат по операции: ${transaction.note}`
          : `Возврат по операции: ${transactionLabel(transaction)}`,
        source: "mini_app",
      });
      setSuccess(`Возврат ${formatMinor(amountMinor)} записан.`);
      cancelRefund();
      await reloadData(telegramId);
    } catch (refundError) {
      setError(
        refundError instanceof Error
          ? refundError.message
          : "Не удалось записать возврат.",
      );
    } finally {
      setRefundingId(null);
    }
  }

  function handleEdit(transaction: Transaction) {
    const mode = editableModeForTransaction(transaction);
    if (!mode) {
      setError("Эту операцию пока нельзя редактировать из интерфейса.");
      return;
    }

    setError(null);
    setSuccess(null);
    cancelRefund();
    setEditingTransactionId(transaction.id);
    setForm({
      ...defaultFormState,
      mode,
      amount: toInputAmount(transaction.amount_minor),
      note: transaction.note ?? "",
      categoryId: transaction.category_id ?? "",
      subcategoryId: transaction.subcategory_id ?? "",
      goalId: transaction.goal_id ?? goals[0]?.id ?? "",
    });
    setActiveTab("add");
  }

  function cancelEditing() {
    setEditingTransactionId(null);
    setForm({
      ...defaultFormState,
      goalId: goals[0]?.id ?? "",
    });
  }

  async function handleDelete(transaction: Transaction) {
    if (!canDeleteTransaction(transaction, transactions)) {
      setError("Сначала убери связанные операции, потом удаляй исходную.");
      return;
    }

    const confirmed = window.confirm(
      `Удалить операцию «${transactionLabel(transaction)}» на ${formatMinor(
        transaction.amount_minor,
      )}?`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);
    setDeletingId(transaction.id);

    try {
      await api.deleteTransaction(telegramId, transaction.id);
      if (editingTransactionId === transaction.id) {
        cancelEditing();
      }
      if (refundDraftId === transaction.id) {
        cancelRefund();
      }
      setSuccess("Операция удалена.");
      await reloadData(telegramId);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить операцию.",
      );
    } finally {
      setDeletingId(null);
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
                  setEditingTransactionId(null);
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
                  setEditingTransactionId(null);
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
                  setEditingTransactionId(null);
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
                  setEditingTransactionId(null);
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
                        {transactionLabel(transaction)}
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
            <SectionCard
              eyebrow={editingTransaction ? "Редактирование" : "Новая запись"}
              title={
                editingTransaction
                  ? "Исправить операцию"
                  : "Добавить движение денег"
              }
              action={
                editingTransaction ? (
                  <button
                    type="button"
                    className="section-card__action"
                    onClick={cancelEditing}
                  >
                    Отменить
                  </button>
                ) : null
              }
            >
              <form className="finance-form" onSubmit={handleSubmit}>
                {editingTransaction ? (
                  <div className="mode-static">
                    Режим: {friendlyType(editingTransaction.type)}
                  </div>
                ) : (
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
                        onClick={() => {
                          setEditingTransactionId(null);
                          setForm((current) => ({
                            ...defaultFormState,
                            mode: value as AddMode,
                            goalId: current.goalId || goals[0]?.id || "",
                          }));
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

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
                  {submitting
                    ? "Сохраняю…"
                    : editingTransaction
                      ? "Сохранить изменения"
                      : "Сохранить запись"}
                </button>
              </form>
            </SectionCard>

            {form.mode === "expense" && !editingTransaction ? (
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

            {!editingTransaction ? (
              <SectionCard eyebrow="Справочник" title="Категории и подкатегории">
                <div className="category-manager">
                  <div className="category-manager__forms">
                    <div className="category-manager__card">
                      <h3 className="category-manager__title">Новая категория</h3>
                      <div className="finance-form">
                        <div className="inline-grid">
                          <label className="field">
                            <span>Тип</span>
                            <select
                              value={categoryForm.kind}
                              onChange={(event) =>
                                setCategoryForm((current) => ({
                                  ...current,
                                  kind: event.target.value as "expense" | "investment",
                                }))
                              }
                              disabled={categorySubmitting}
                            >
                              <option value="expense">Расход</option>
                              <option value="investment">Инвестиция</option>
                            </select>
                          </label>

                          <label className="field">
                            <span>Порядок</span>
                            <input
                              type="number"
                              value={categoryForm.sortOrder}
                              onChange={(event) =>
                                setCategoryForm((current) => ({
                                  ...current,
                                  sortOrder: event.target.value,
                                }))
                              }
                              disabled={categorySubmitting}
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span>Название</span>
                          <input
                            type="text"
                            placeholder="Например, Здоровье или Брокерский счет"
                            value={categoryForm.name}
                            onChange={(event) =>
                              setCategoryForm((current) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                            disabled={categorySubmitting}
                          />
                        </label>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={categorySubmitting}
                          onClick={() => void handleCategoryCreate()}
                        >
                          {categorySubmitting ? "Создаю…" : "Создать категорию"}
                        </button>
                      </div>
                    </div>

                    <div className="category-manager__card">
                      <h3 className="category-manager__title">Новая подкатегория</h3>
                      <div className="finance-form">
                        <label className="field">
                          <span>Категория</span>
                          <select
                            value={subcategoryForm.categoryId}
                            onChange={(event) =>
                              setSubcategoryForm((current) => ({
                                ...current,
                                categoryId: event.target.value,
                              }))
                            }
                            disabled={subcategorySubmitting}
                          >
                            <option value="">Выбери категорию</option>
                            {availableSubcategoryCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.kind === "expense" ? "Расход" : "Инвестиция"} ·{" "}
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="inline-grid">
                          <label className="field">
                            <span>Название</span>
                            <input
                              type="text"
                              placeholder="Например, Кафе или ETF"
                              value={subcategoryForm.name}
                              onChange={(event) =>
                                setSubcategoryForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              disabled={subcategorySubmitting}
                            />
                          </label>

                          <label className="field">
                            <span>Порядок</span>
                            <input
                              type="number"
                              value={subcategoryForm.sortOrder}
                              onChange={(event) =>
                                setSubcategoryForm((current) => ({
                                  ...current,
                                  sortOrder: event.target.value,
                                }))
                              }
                              disabled={subcategorySubmitting}
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={subcategorySubmitting}
                          onClick={() => void handleSubcategoryCreate()}
                        >
                          {subcategorySubmitting ? "Создаю…" : "Создать подкатегорию"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="category-manager__groups">
                    {categoryGroups.map((group) => (
                      <div key={group.key} className="category-manager__group">
                        <h3 className="category-manager__title">{group.title}</h3>
                        <div className="category-manager__list">
                          {group.items.map((category) => (
                            <article key={category.id} className="category-manager__item">
                              <div className="category-manager__head">
                                <div>
                                  <strong>{category.name}</strong>
                                  <div className="transaction-row__meta">
                                    Порядок: {category.sort_order}
                                  </div>
                                </div>
                                <div className="category-manager__actions">
                                  {category.is_archived ? (
                                    <span className="category-manager__badge">В архиве</span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="transaction-row__action transaction-row__action--muted"
                                    disabled={categoryUpdatingId === category.id}
                                    onClick={() => void handleCategoryArchiveToggle(category)}
                                  >
                                    {categoryUpdatingId === category.id
                                      ? "Обновляю…"
                                      : category.is_archived
                                        ? "Вернуть"
                                        : "В архив"}
                                  </button>
                                </div>
                              </div>

                              {category.subcategories.length > 0 ? (
                                <div className="category-manager__sublist">
                                  {category.subcategories.map((subcategory) => (
                                    <div
                                      key={subcategory.id}
                                      className="category-manager__subitem"
                                    >
                                      <div>
                                        <strong>{subcategory.name}</strong>
                                        <div className="transaction-row__meta">
                                          Порядок: {subcategory.sort_order}
                                        </div>
                                      </div>
                                      <div className="category-manager__actions">
                                        {subcategory.is_archived ? (
                                          <span className="category-manager__badge">
                                            В архиве
                                          </span>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="transaction-row__action transaction-row__action--muted"
                                          disabled={subcategoryUpdatingId === subcategory.id}
                                          onClick={() =>
                                            void handleSubcategoryArchiveToggle(
                                              subcategory.id,
                                              subcategory.is_archived,
                                            )
                                          }
                                        >
                                          {subcategoryUpdatingId === subcategory.id
                                            ? "Обновляю…"
                                            : subcategory.is_archived
                                              ? "Вернуть"
                                              : "В архив"}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="transaction-row__meta">
                                  Подкатегорий пока нет.
                                </div>
                              )}
                            </article>
                          ))}
                          {group.items.length === 0 ? (
                            <div className="empty-state">Пока пусто.</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : null}

        {!loading && activeTab === "history" ? (
          <div className="stack">
            <SectionCard eyebrow="Журнал" title="История операций">
              <div className="transaction-list">
                {transactions.map((transaction) => {
                  const remainingMinor = refundableRemainingMinor(
                    transaction,
                    transactions,
                  );
                  const isRefundDraftOpen = refundDraftId === transaction.id;

                  return (
                  <article className="transaction-row" key={transaction.id}>
                    <div className="transaction-row__main">
                      <div className="transaction-row__title">
                        {transactionLabel(transaction)}
                      </div>
                      <div className="transaction-row__meta">
                        {new Date(transaction.occurred_at).toLocaleString("ru-RU")} ·{" "}
                        {friendlyType(transaction.type)}
                      </div>
                      {transaction.note ? (
                        <div className="transaction-row__note">{transaction.note}</div>
                      ) : null}
                      {isRefundDraftOpen ? (
                        <div className="transaction-row__refund-form">
                          <label className="field">
                            <span>
                              Сумма возврата, максимум {formatMinor(remainingMinor)}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={refundAmount}
                              onChange={(event) => setRefundAmount(event.target.value)}
                              disabled={refundingId === transaction.id}
                            />
                          </label>
                          <div className="transaction-row__refund-actions">
                            <button
                              type="button"
                              className="transaction-row__action"
                              disabled={refundingId === transaction.id}
                              onClick={() => void handleRefund(transaction)}
                            >
                              {refundingId === transaction.id
                                ? "Оформляю…"
                                : "Подтвердить возврат"}
                            </button>
                            <button
                              type="button"
                              className="transaction-row__action transaction-row__action--muted"
                              disabled={refundingId === transaction.id}
                              onClick={cancelRefund}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="transaction-row__side">
                      <strong>{formatMinor(transaction.amount_minor)}</strong>
                      <div className="transaction-row__actions">
                        {canEditTransaction(transaction, transactions) ? (
                          <button
                            type="button"
                            className="transaction-row__action"
                            onClick={() => handleEdit(transaction)}
                          >
                            Редактировать
                          </button>
                        ) : null}
                        {remainingMinor > 0 ? (
                          <button
                            type="button"
                            className="transaction-row__action"
                            disabled={refundingId === transaction.id}
                            onClick={() => startRefund(transaction)}
                          >
                            {isRefundDraftOpen
                              ? "Изменить возврат"
                              : `Вернуть до ${formatMinor(remainingMinor)}`}
                          </button>
                        ) : null}
                        {canDeleteTransaction(transaction, transactions) ? (
                          <button
                            type="button"
                            className="transaction-row__action transaction-row__action--danger"
                            disabled={deletingId === transaction.id}
                            onClick={() => void handleDelete(transaction)}
                          >
                            {deletingId === transaction.id ? "Удаляю…" : "Удалить"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                  );
                })}
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
                {recurring.map((item) => {
                  const itemCategory =
                    categories.find((category) => category.id === item.category_id) ?? null;
                  const itemSubcategory =
                    itemCategory?.subcategories.find(
                      (subcategory) => subcategory.id === item.subcategory_id,
                    ) ?? null;
                  const isEditing = editingRecurringId === item.id && recurringForm !== null;

                  return (
                    <article key={item.id} className="recurring-item">
                      <div className="recurring-item__main">
                        <div className="recurring-item__head">
                          <strong>{item.name}</strong>
                          {!item.is_active ? (
                            <span className="recurring-item__status">На паузе</span>
                          ) : null}
                        </div>
                        <div className="transaction-row__meta">
                          {item.kind === "fixed" ? "Фиксированная" : "Плавающая"} ·{" "}
                          {friendlyCadence(item.cadence)}
                          {item.day_of_month ? ` · ${item.day_of_month} число` : ""}
                        </div>
                        <div className="transaction-row__meta">
                          {itemSubcategory?.name || itemCategory?.name || "Без категории"}
                        </div>
                        {item.note ? (
                          <div className="transaction-row__note">{item.note}</div>
                        ) : null}
                        {isEditing ? (
                          <div className="recurring-item__form">
                            <label className="field">
                              <span>Название</span>
                              <input
                                type="text"
                                value={recurringForm.name}
                                onChange={(event) =>
                                  setRecurringForm((current) =>
                                    current
                                      ? { ...current, name: event.target.value }
                                      : current,
                                  )
                                }
                                disabled={recurringSubmittingId === item.id}
                              />
                            </label>

                            <label className="field">
                              <span>Категория</span>
                              <select
                                value={recurringForm.categoryId}
                                onChange={(event) =>
                                  setRecurringForm((current) =>
                                    current
                                      ? {
                                          ...current,
                                          categoryId: event.target.value,
                                          subcategoryId: "",
                                        }
                                      : current,
                                  )
                                }
                                disabled={recurringSubmittingId === item.id}
                              >
                                <option value="">Выбери категорию</option>
                                {availableExpenseCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {recurringEditSubcategories.length > 0 ? (
                              <label className="field">
                                <span>Подкатегория</span>
                                <select
                                  value={recurringForm.subcategoryId}
                                  onChange={(event) =>
                                    setRecurringForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            subcategoryId: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  disabled={recurringSubmittingId === item.id}
                                >
                                  <option value="">Без подкатегории</option>
                                  {recurringEditSubcategories.map((subcategory) => (
                                    <option key={subcategory.id} value={subcategory.id}>
                                      {subcategory.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}

                            <div className="inline-grid">
                              <label className="field">
                                <span>Тип</span>
                                <select
                                  value={recurringForm.kind}
                                  onChange={(event) =>
                                    setRecurringForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            kind: event.target.value as "fixed" | "variable",
                                          }
                                        : current,
                                    )
                                  }
                                  disabled={recurringSubmittingId === item.id}
                                >
                                  <option value="fixed">Фиксированная</option>
                                  <option value="variable">Плавающая</option>
                                </select>
                              </label>

                              <label className="field">
                                <span>Периодичность</span>
                                <select
                                  value={recurringForm.cadence}
                                  onChange={(event) =>
                                    setRecurringForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            cadence: event.target.value as
                                              | "monthly"
                                              | "yearly"
                                              | "custom",
                                          }
                                        : current,
                                    )
                                  }
                                  disabled={recurringSubmittingId === item.id}
                                >
                                  <option value="monthly">Ежемесячно</option>
                                  <option value="yearly">Ежегодно</option>
                                  <option value="custom">Своя</option>
                                </select>
                              </label>
                            </div>

                            <div className="inline-grid">
                              <label className="field">
                                <span>Ожидаемая сумма</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="Можно оставить пустым"
                                  value={recurringForm.expectedAmount}
                                  onChange={(event) =>
                                    setRecurringForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            expectedAmount: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  disabled={recurringSubmittingId === item.id}
                                />
                              </label>

                              <label className="field">
                                <span>День месяца</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="31"
                                  placeholder="Можно пусто"
                                  value={recurringForm.dayOfMonth}
                                  onChange={(event) =>
                                    setRecurringForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            dayOfMonth: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  disabled={recurringSubmittingId === item.id}
                                />
                              </label>
                            </div>

                            <label className="field">
                              <span>Комментарий</span>
                              <textarea
                                rows={2}
                                value={recurringForm.note}
                                onChange={(event) =>
                                  setRecurringForm((current) =>
                                    current
                                      ? { ...current, note: event.target.value }
                                      : current,
                                  )
                                }
                                disabled={recurringSubmittingId === item.id}
                              />
                            </label>

                            <div className="recurring-item__form-actions">
                              <button
                                type="button"
                                className="transaction-row__action"
                                disabled={recurringSubmittingId === item.id}
                                onClick={() => void handleRecurringUpdate(item)}
                              >
                                {recurringSubmittingId === item.id
                                  ? "Сохраняю…"
                                  : "Сохранить"}
                              </button>
                              <button
                                type="button"
                                className="transaction-row__action transaction-row__action--muted"
                                disabled={recurringSubmittingId === item.id}
                                onClick={cancelRecurringEdit}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="recurring-item__side">
                        <span>
                          {item.expected_amount_minor
                            ? formatMinor(item.expected_amount_minor)
                            : "Без суммы"}
                        </span>
                        <div className="recurring-item__actions">
                          <button
                            type="button"
                            className="transaction-row__action"
                            disabled={recurringSubmittingId === item.id}
                            onClick={() => startRecurringEdit(item)}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="transaction-row__action transaction-row__action--muted"
                            disabled={recurringSubmittingId === item.id}
                            onClick={() => void handleRecurringToggle(item)}
                          >
                            {item.is_active ? "Пауза" : "Возобновить"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
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
            <SectionCard
              eyebrow="Накопления"
              title="Цели и резервы"
              action={
                <button
                  type="button"
                  className="section-card__action"
                  onClick={showGoalCreateForm ? cancelGoalCreate : startGoalCreate}
                >
                  {showGoalCreateForm ? "Скрыть форму" : "Новая цель"}
                </button>
              }
            >
              {showGoalCreateForm ? (
                <div className="goal-create-form">
                  <label className="field">
                    <span>Название</span>
                    <input
                      type="text"
                      placeholder="Например, отпуск или подушка"
                      value={goalForm.name}
                      onChange={(event) =>
                        setGoalForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      disabled={goalSubmitting}
                    />
                  </label>

                  <div className="inline-grid">
                    <label className="field">
                      <span>Тип</span>
                      <select
                        value={goalForm.kind}
                        onChange={(event) =>
                          setGoalForm((current) => ({
                            ...current,
                            kind: event.target.value as "reserve" | "deposit" | "custom",
                          }))
                        }
                        disabled={goalSubmitting}
                      >
                        <option value="reserve">Подушка</option>
                        <option value="deposit">Накопление</option>
                        <option value="custom">Своя цель</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Целевая сумма</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Можно оставить пустым"
                        value={goalForm.targetAmount}
                        onChange={(event) =>
                          setGoalForm((current) => ({
                            ...current,
                            targetAmount: event.target.value,
                          }))
                        }
                        disabled={goalSubmitting}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Порядок</span>
                    <input
                      type="number"
                      value={goalForm.sortOrder}
                      onChange={(event) =>
                        setGoalForm((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                      disabled={goalSubmitting}
                    />
                  </label>

                  <div className="goal-create-form__actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={goalSubmitting}
                      onClick={() => void handleGoalCreate()}
                    >
                      {goalSubmitting ? "Создаю…" : "Создать цель"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={goalSubmitting}
                      onClick={cancelGoalCreate}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="goal-grid">
                {goals.map((goal) => {
                  const targetProgress = goal.target_amount_minor
                    ? Math.min(
                        100,
                        Math.max(
                          6,
                          (goal.balance_minor / Math.max(goal.target_amount_minor, 1)) * 100,
                        ),
                      )
                    : 0;

                  return (
                    <article key={goal.id} className="goal-tile goal-tile--large">
                      <span>{goal.name}</span>
                      <strong>{formatMinor(goal.balance_minor)}</strong>
                      <small>{friendlyGoalKind(goal.kind)}</small>
                      {goal.target_amount_minor ? (
                        <div className="goal-tile__target">
                          Цель: {formatMinor(goal.target_amount_minor)}
                        </div>
                      ) : (
                        <div className="goal-tile__target">Цель без лимита</div>
                      )}
                      {goal.target_amount_minor ? (
                        <div className="category-bar__track">
                          <div
                            className="category-bar__fill category-bar__fill--warm"
                            style={{ width: `${targetProgress}%` }}
                          />
                        </div>
                      ) : null}
                      <div className="goal-tile__actions">
                        <button
                          type="button"
                          className="transaction-row__action"
                          onClick={() => startGoalAllocation(goal)}
                        >
                          Пополнить
                        </button>
                        <button
                          type="button"
                          className="transaction-row__action transaction-row__action--muted"
                          onClick={() => void openGoalHistory(goal)}
                        >
                          {goalHistoryId === goal.id ? "Скрыть историю" : "История"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {goals.length === 0 ? (
                  <div className="empty-state">
                    Целей пока нет. Создай первую цель прямо на этой вкладке.
                  </div>
                ) : null}
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

            {goalHistoryId ? (
              <SectionCard eyebrow="История цели" title="Последние пополнения">
                {goalHistoryLoading ? (
                  <div className="loading-card">Загружаю историю цели…</div>
                ) : goalHistoryItems.length > 0 ? (
                  <div className="goal-history-list">
                    {goalHistoryItems.map((item) => (
                      <article key={item.id} className="goal-history-item">
                        <div>
                          <div className="transaction-row__title">
                            {item.type === "goal_allocation"
                              ? "Пополнение цели"
                              : item.type}
                          </div>
                          <div className="transaction-row__meta">
                            {new Date(item.occurred_at).toLocaleString("ru-RU")}
                          </div>
                          {item.note ? (
                            <div className="transaction-row__note">{item.note}</div>
                          ) : null}
                        </div>
                        <strong>{formatMinor(item.amount_minor)}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    По этой цели пока нет операций.
                  </div>
                )}
              </SectionCard>
            ) : null}
          </div>
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
