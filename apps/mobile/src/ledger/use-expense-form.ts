import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useIsFocused, usePreventRemove } from 'expo-router/react-navigation';
import { getLocales } from 'expo-localization';
import {
  categoryNameKey,
  currencyDecimals,
  formatAmount,
  isLocalDate,
  parseAmount,
  toLocalDate,
} from '@shared-expense/domain';
import {
  createCategory,
  isUncategorizedCategory,
  listCategories,
  type Category,
} from '../categories';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import {
  ArchivedExpenseError,
  listExpenses,
  saveExpense,
  type Expense,
} from './expenses';

export interface LoadedForm {
  categories: Category[];
  groups: Group[];
  formerMembers: GroupMember[];
  initialGroupId?: string;
  expense?: Expense;
}

/** What the form shows from the local data, read again each time it comes back into focus. */
export function useExpenseFormData(
  expenseId: string | undefined,
  initialGroupId: string | undefined,
) {
  const database = useLocalDatabase();
  const focused = useIsFocused();
  const [loaded, setLoaded] = useState<LoadedForm>();
  const [error, setError] = useState<unknown>();
  const latestRead = useRef<Promise<LoadedForm>>(undefined);
  const read = useCallback(() => {
    const request = Promise.all([
      listCategories(database),
      expenseId ? listExpenses(database) : Promise.resolve([] as Expense[]),
      listGroups(database),
    ]).then(async ([categories, expenses, groups]) => {
      const expense = expenses.find(
        (item) => item.id === expenseId && item.trashOrder === undefined,
      );
      const formerMembers = expense
        ? await listFormerMembers(database, expense.spaceId)
        : [];
      return {
        categories,
        expense,
        groups,
        formerMembers,
        initialGroupId: groups.find(
          (group) => group.id === initialGroupId && !group.archived,
        )?.id,
      };
    });
    latestRead.current = request;
    request.then(
      (form) => {
        if (latestRead.current === request) setLoaded(form);
      },
      (failure: unknown) => {
        if (latestRead.current === request) setError(failure);
      },
    );
    return request;
  }, [database, expenseId, initialGroupId]);
  useEffect(() => {
    void read();
  }, [read, focused]);
  if (error) throw error;
  return { loaded, latestRead: () => latestRead.current!, reread: read };
}

function normalizeAmount(text: string) {
  return text
    .replace(/[０-９．，]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replaceAll(',', '.');
}

export type ExpenseFormProps = LoadedForm & {
  latestRead: () => Promise<LoadedForm>;
  reread: () => Promise<LoadedForm>;
};

/** The currency a new expense starts in: the region's, or USD when the app has no format for it. */
export function defaultCurrency() {
  const reported = getLocales()[0]?.currencyCode ?? 'USD';
  return currencyDecimals(reported) === undefined ? 'USD' : reported;
}

/** The draft on the form: what it holds, what can be chosen, and saving it. */
export function useExpenseForm({
  categories,
  expense,
  groups,
  formerMembers,
  initialGroupId,
  latestRead,
  reread,
}: ExpenseFormProps) {
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const groupLocked = !!expense && expense.spaceId !== identity.personalSpaceId;
  const today = toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [initial] = useState(() => {
    const groupId = groupLocked ? expense.spaceId : initialGroupId;
    const spaceId = groupId ?? identity.personalSpaceId;
    return {
      split: !!groupId,
      groupId,
      payerId: groupLocked ? expense.payments[0].participant : undefined,
      participants: groupLocked
        ? expense.shares.map((share) => share.participant)
        : ([] as string[]),
      currency: expense?.currency ?? defaultCurrency(),
      amount: expense
        ? formatAmount(expense.amountMinor, expense.currency)!
        : '',
      title: expense?.title ?? '',
      categoryId:
        expense?.category.id ??
        categories.find(
          (category) => category.spaceId === spaceId && !category.isArchived,
        )!.id,
      date: expense?.date ?? today,
      note: expense?.note ?? '',
    };
  });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const savingRef = useRef(false);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const spaceId = form.groupId ?? identity.personalSpaceId;
  const spaceCategories = categories.filter((item) => item.spaceId === spaceId);
  const category =
    spaceCategories.find((item) => item.id === form.categoryId) ??
    spaceCategories.find(isUncategorizedCategory)!;
  const group = groups.find((item) => item.id === form.groupId);
  const members = group?.members ?? [];
  const financialLocked =
    groupLocked &&
    [...expense.payments, ...expense.shares].some(
      (share) => !members.some((member) => member.id === share.participant),
    );
  const dirty =
    form.amount.trim() !== initial.amount.trim() ||
    form.title.trim() !== initial.title.trim() ||
    form.note.trim() !== initial.note.trim() ||
    category.id !== initial.categoryId ||
    form.date !== initial.date ||
    form.split !== initial.split ||
    form.groupId !== initial.groupId ||
    form.payerId !== initial.payerId ||
    form.participants.length !== initial.participants.length ||
    form.participants.some((id) => !initial.participants.includes(id));
  const amountMinor = parseAmount(
    normalizeAmount(form.amount),
    initial.currency,
  );
  const canSave =
    dirty &&
    !!form.title.trim() &&
    amountMinor !== undefined &&
    (!form.split ||
      (!!form.groupId && !!form.payerId && form.participants.length > 0));

  function change(
    key: 'amount' | 'title' | 'note' | 'categoryId' | 'date',
    value: string,
  ) {
    if (!savingRef.current)
      setForm((previous) => ({ ...previous, [key]: value }));
  }

  function changeDate(date: string) {
    if (isLocalDate(date) && date <= today) change('date', date);
  }

  function chooseGroup(groupId?: string) {
    if (savingRef.current || groupLocked || groupId === form.groupId) return;
    const target = categories.filter(
      (item) => item.spaceId === (groupId ?? identity.personalSpaceId),
    );
    const matching =
      target.find(
        (item) =>
          !item.isArchived &&
          categoryNameKey(item.name) === categoryNameKey(category.name),
      ) ?? target.find(isUncategorizedCategory)!;
    setForm((previous) => ({
      ...previous,
      groupId,
      categoryId: matching.id,
      payerId: undefined,
      participants: [],
    }));
  }

  function changeSplit(enabled: boolean) {
    if (savingRef.current || groupLocked) return;
    setForm((previous) => ({ ...previous, split: enabled }));
    if (!enabled) chooseGroup();
  }

  function choosePayer(payerId: string) {
    if (savingRef.current || financialLocked) return;
    setForm((previous) => ({ ...previous, payerId }));
  }

  function toggleParticipant(id: string) {
    if (savingRef.current || financialLocked) return;
    setForm((previous) => ({
      ...previous,
      participants: previous.participants.includes(id)
        ? previous.participants.filter((item) => item !== id)
        : [...previous.participants, id],
    }));
  }

  /** Adds a category to the form's space and chooses it. */
  async function addCategory(input: { name: string; color: string }) {
    const { id } = await createCategory(database, {
      ...input,
      createdByUserId: identity.userId,
      spaceId,
    });
    // The form has to learn when the category is deleted later, so it comes from a read.
    await reread().catch(() => undefined);
    change('categoryId', id);
  }

  usePreventRemove((dirty || saving) && !leaving, ({ repeat }) => {
    if (savingRef.current) return;
    // Expo Router blocks the action again unless the prevention is off when it repeats.
    const leave = () => {
      setLeaving(true);
      repeat();
    };
    if (closingRef.current) {
      leave();
      return;
    }
    Alert.alert('Discard Changes?', 'Your changes will not be saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  });

  function close() {
    if (savingRef.current) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function save() {
    if (
      closingRef.current ||
      savingRef.current ||
      !canSave ||
      amountMinor === undefined
    )
      return;
    savingRef.current = true;
    setSaving(true);
    try {
      // A read made when the form came back may have dropped its category (SHELL-64.1).
      // When it fails, the form shows the read error, not a save alert (SHELL-60.1).
      const read = await latestRead().catch(() => undefined);
      if (!read) return;
      const inSpace = read.categories.filter(
        (item) => item.spaceId === spaceId,
      );
      const categoryId = (
        inSpace.find((item) => item.id === category.id) ??
        inSpace.find(isUncategorizedCategory)!
      ).id;
      await saveExpense(
        database,
        identity,
        {
          title: form.title,
          amountMinor,
          currency: initial.currency,
          date: form.date,
          categoryId,
          note: form.note,
        },
        expense,
        form.split
          ? {
              groupId: form.groupId!,
              payerId: form.payerId!,
              participants: form.participants,
            }
          : undefined,
      );
      savingRef.current = false;
      closingRef.current = true;
      close();
    } catch (error) {
      if (error instanceof ArchivedExpenseError)
        Alert.alert(
          'Historical Shared Expense',
          'Restore its group before editing this expense.',
        );
      else
        Alert.alert(
          'Unable to Save Expense',
          'Your expense could not be saved. Please try again.',
        );
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return {
    form,
    currency: initial.currency,
    today,
    saving,
    canSave,
    isEdit: !!expense,
    groups,
    group,
    members,
    payer: [...members, ...formerMembers].find(
      (member) => member.id === form.payerId,
    ),
    category,
    spaceCategories,
    groupLocked,
    financialLocked,
    memberName: (member: GroupMember) =>
      member.name + (member.userId === identity.userId ? ' (You)' : ''),
    change,
    changeDate,
    chooseGroup,
    changeSplit,
    choosePayer,
    toggleParticipant,
    addCategory,
    close,
    save,
  };
}

export type ExpenseFormEditor = ReturnType<typeof useExpenseForm>;
