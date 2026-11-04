import type { Share } from '../ledger/money';

interface GroupExpense {
  spaceId: string;
  currency: string;
  amountMinor: number;
  payments: readonly Share<string>[];
  shares: readonly Share<string>[];
  trashOrder?: number;
}

interface Balance {
  paid: bigint;
  share: bigint;
  net: bigint;
}

/** Per-currency totals and member balances, excluding expenses in the trash. */
export function groupAmounts(
  expenses: readonly GroupExpense[],
  group: { id: string; members: readonly { id: string }[] },
) {
  const currencies = new Map<
    string,
    { total: bigint; members: Map<string, Balance> }
  >();
  for (const expense of expenses) {
    if (expense.spaceId !== group.id || expense.trashOrder !== undefined)
      continue;
    let amounts = currencies.get(expense.currency);
    if (!amounts) {
      amounts = { total: 0n, members: new Map() };
      for (const member of group.members)
        amounts.members.set(member.id, { paid: 0n, share: 0n, net: 0n });
      currencies.set(expense.currency, amounts);
    }
    amounts.total += BigInt(expense.amountMinor);
    for (const [field, allocations] of [
      ['paid', expense.payments],
      ['share', expense.shares],
    ] as const) {
      for (const allocation of allocations) {
        let balance = amounts.members.get(allocation.participant);
        if (!balance) {
          balance = { paid: 0n, share: 0n, net: 0n };
          amounts.members.set(allocation.participant, balance);
        }
        balance[field] += BigInt(allocation.amountMinor);
        balance.net = balance.paid - balance.share;
      }
    }
  }
  return [...currencies.keys()]
    .sort()
    .map((currency) => ({ currency, ...currencies.get(currency)! }));
}
