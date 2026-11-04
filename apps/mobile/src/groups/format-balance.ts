import { formatCurrency } from '@shared-expense/domain';

export function formatBalance(
  net: bigint,
  currency: string,
  locale: string,
  own: boolean,
) {
  if (net === 0n) return 'Settled up';
  const label = own
    ? net > 0n
      ? "You're owed:"
      : 'You owe:'
    : net > 0n
      ? 'Is Owed'
      : 'Owes';
  return `${label} ${formatCurrency(net < 0n ? -net : net, currency, locale)}`;
}
