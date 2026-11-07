import { formatCurrency, type groupAmounts } from '@shared-expense/domain';

type GroupAmounts = ReturnType<typeof groupAmounts>;

/** A member's balance in one currency, as Balances shows it. */
export function formatBalance(net: bigint, currency: string, locale: string) {
  if (net === 0n) return 'Settled up';
  const label = net > 0n ? 'Is Owed' : 'Owes';
  return `${label} ${formatCurrency(net < 0n ? -net : net, currency, locale)}`;
}

/** Your net balance: a line for what you owe and one for what you are owed, or Settled up. */
export function yourBalanceLines(
  amounts: GroupAmounts,
  ownId: string,
  locale: string,
) {
  const owed = (sign: 1n | -1n) =>
    amounts
      .filter(({ members }) => sign * members.get(ownId)!.net > 0n)
      .map(({ currency, members }) =>
        formatCurrency(sign * members.get(ownId)!.net, currency, locale),
      )
      .join(', ');
  const youOwe = owed(-1n);
  const youAreOwed = owed(1n);
  const lines = [
    ...(youOwe ? [`You owe: ${youOwe}`] : []),
    ...(youAreOwed ? [`You're owed: ${youAreOwed}`] : []),
  ];
  return lines.length > 0 ? lines : ['Settled up'];
}

/** The two lines under the name on a group's card; the second can be empty. */
export function groupCardLines(
  amounts: GroupAmounts,
  ownId: string,
  locale: string,
): [string, string] {
  if (amounts.length === 0) return ['No spending yet', ''];
  const [first, second] = yourBalanceLines(amounts, ownId, locale);
  if (second) return [first, second];
  const shares = amounts.map(({ currency, members }) =>
    formatCurrency(members.get(ownId)!.share, currency, locale),
  );
  return [`Your share: ${shares.join(', ')}`, first];
}
