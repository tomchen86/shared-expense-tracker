import type { Share } from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';

/** An expense as the phone stores it (LEDGER-27.1). */
export interface Expense {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  /** The category, with its name and color as they were when the expense was last saved. */
  category: { id: string; name: string; color: string };
  /** Left out when the expense has no note. */
  note?: string;
  /** The personal space or the group the expense belongs to. */
  spaceId: string;
  /** Each payment's participant is a participant id. */
  payments: Share<string>[];
  /** Each share's participant is a participant id. */
  shares: Share<string>[];
}

/** Every stored expense, in the order of LEDGER-28.1. */
export const listExpenses: (
  database: SqlExecutor,
) => Promise<Expense[]> = async () => [];
