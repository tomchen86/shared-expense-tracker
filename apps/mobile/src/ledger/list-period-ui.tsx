import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ListRenderItemInfo,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { DateField } from '../ui/date-field';
import { DateRange } from '../ui/date-range';
import { FadeText } from '../ui/fade-text';
import { GlassSurface } from '../ui/glass-surface';
import { GroupedSection } from '../ui/grouped-section';
import { MenuField } from '../ui/menu-field';
import { PeriodName } from '../ui/period-name';
import { Sheet } from '../ui/sheet';
import {
  SwipeFlatList,
  SwipeListScope,
  useListScrollGesture,
  useSidewaysDragIsNoPress,
} from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { usePeriodSwipe } from '../ui/use-period-swipe';
import { DateHeading } from './dated-cards';
import {
  PERIOD_OPTIONS,
  datesOf,
  earlierPeriod,
  emptyPeriodName,
  firstRange,
  hasNext,
  insightsParams,
  monthOf,
  optionOf,
  periodName,
  periodOf,
  stepped,
  today,
  type Dates,
  type ListPeriod,
  type Period,
} from './list-period';
import type { ExpenseView } from './use-expenses';

/**
 * The period of one list (LEDGER-107.1) and what it leaves of `expenses`, which are all that the
 * list can show, latest first, or undefined until they are read. `inGroup` is a group's screen,
 * which opens on all dates and calls them Group Total; the expense list opens on this month.
 * `placed` are the IDs useReadExpenses brought with these expenses.
 */
export function useListPeriod(
  inGroup: boolean,
  expenses: ExpenseView[] | undefined,
  placed: readonly string[],
) {
  const locale = useDisplayLocale();
  const day = today();
  const [list, setList] = useState<ListPeriod>(() => ({
    period: inGroup ? { kind: 'all' } : monthOf(day),
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { period } = list;
  const dates = datesOf(list, day);
  const from = dates?.from;
  const to = dates?.to;

  // An expense the user just added or put back stays in sight: one dated outside the period
  // moves the list to its month (LEDGER-117.1). The last one decides.
  const [seen, setSeen] = useState(placed);
  if (expenses && placed !== seen) {
    setSeen(placed);
    const outside = expenses.filter(
      (expense) =>
        placed.includes(expense.id) &&
        dates &&
        (expense.date < dates.from || expense.date > dates.to),
    );
    const last = placed.findLast((id) => outside.some((one) => one.id === id));
    const moved = outside.find((expense) => expense.id === last);
    if (moved)
      setList((current) => ({ ...current, period: monthOf(moved.date) }));
  }

  const shown = useMemo(
    () =>
      from === undefined || to === undefined
        ? expenses
        : expenses?.filter(({ date }) => date >= from && date <= to),
    [expenses, from, to],
  );
  const setPeriod = (next: Period) =>
    setList((current) => ({ ...current, period: next }));
  const choose = (id: string) =>
    setList((current) => {
      const next = periodOf(id, day);
      return {
        period: next,
        // The dates it had the last time, or on its first time this month up to today.
        range:
          next.kind === 'custom'
            ? (current.range ?? firstRange(day))
            : current.range,
      };
    });
  const allName = inGroup ? 'Group Total' : 'All Time';
  const name = periodName(period, day, allName);
  /** The period holds none of the list's expenses, and the list has some (LEDGER-116.1). */
  const empty =
    dates !== undefined && shown?.length === 0 && expenses!.length > 0;
  const earlier = empty
    ? earlierPeriod(
        period,
        dates.from,
        expenses!.map(({ date }) => date),
      )
    : undefined;
  const range =
    period.kind === 'custom' ? (list.range ?? firstRange(day)) : undefined;
  const setRange = (next: Dates) =>
    setList((current) => ({ ...current, range: next }));

  return {
    /** The expenses dated in the period, in the order they came; undefined until they are read. */
    shown,
    /** The name on the period row. */
    name,
    /** Today, the latest day a custom range can reach. */
    day,
    /** The option of the Date list the period is; none for another month or year. */
    option: optionOf(period, day),
    choose,
    /** To the month or year before and after; none when the period is neither. */
    steps:
      'key' in period
        ? {
            previous: () => setPeriod(stepped(period, -1)),
            next: hasNext(period, day)
              ? () => setPeriod(stepped(period, 1))
              : undefined,
          }
        : undefined,
    /** The dates of a custom range as they were chosen; none on another period. */
    range,
    setRange,
    /** What to say in place of the cards when the period holds none, and the way to an earlier one that does. */
    empty: empty
      ? {
          name: emptyPeriodName(list, day, locale),
          earlier: earlier && {
            name: periodName(earlier, day, allName),
            show: () => setPeriod(earlier),
          },
        }
      : undefined,
    /** The search params that open Insights on the period. */
    insights: insightsParams(list, day),
    openFilters: () => setFiltersOpen(true),
    /** Filters, to render over the list's screen. */
    filters: (
      <Filters
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={
          PERIOD_OPTIONS.find(({ id }) => id === optionOf(period, day))?.name ??
          name
        }
        selected={optionOf(period, day)}
        onChoose={choose}
        range={range}
        day={day}
        onRange={setRange}
      />
    ),
  };
}

export type ListPeriodState = ReturnType<typeof useListPeriod>;

/** Filters (LEDGER-109.1): the Date row, and under it the two dates of a custom range. */
function Filters({
  visible,
  onClose,
  value,
  selected,
  onChoose,
  range,
  day,
  onRange,
}: {
  visible: boolean;
  onClose: () => void;
  /** What the Date row shows. */
  value: string;
  selected: string | undefined;
  onChoose: (id: string) => void;
  range: Dates | undefined;
  day: string;
  onRange: (range: Dates) => void;
}) {
  return (
    <Sheet
      visible={visible}
      title="Filters"
      confirm={{ label: 'Done', onPress: onClose }}
      onClose={onClose}
    >
      <GroupedSection>
        <MenuField
          title="Date"
          label="Date"
          value={value}
          options={PERIOD_OPTIONS}
          selected={selected === undefined ? [] : [selected]}
          onSelect={onChoose}
        />
        {range && (
          <>
            <DateField
              label="From"
              value={range.from}
              maximumDate={day}
              onChange={(from) => onRange({ ...range, from })}
            />
            <DateField
              label="To"
              value={range.to}
              maximumDate={day}
              onChange={(to) => onRange({ ...range, to })}
            />
          </>
        )}
      </GroupedSection>
    </Sheet>
  );
}

/** How long what is under a custom range's dates takes to move when they appear or go (LEDGER-113.1). */
const RANGE_SHIFT = 300;

/**
 * What a PeriodList draws above its cards and for each of them. Its lists take them from here and
 * not as props, so that they only work out again which cards to draw when the expenses change,
 * not each time the screen renders.
 */
const ListParts = createContext<{
  header: ReactNode;
  row: (expense: ExpenseView, index: number) => ReactNode;
} | null>(null);

function ListHeader() {
  return useContext(ListParts)!.header;
}

function ListRow({ item, index }: ListRenderItemInfo<ExpenseView>) {
  return useContext(ListParts)!.row(item, index);
}

const renderRow = (info: ListRenderItemInfo<ExpenseView>) => (
  <ListRow {...info} />
);

const expenseId = (expense: ExpenseView) => expense.id;

/** One array, so that a list waiting for its expenses is given the same one each time. */
const NO_EXPENSES: ExpenseView[] = [];

interface PeriodListProps extends Pick<
  FlatListProps<ExpenseView>,
  'onScroll' | 'scrollEventThrottle'
> {
  periods: ListPeriodState;
  /** On a pushed screen: iOS's back gesture gets the drags to the right that nothing here uses. */
  backSwipe?: boolean;
  /** What stands above the period row. */
  top?: ReactNode;
  /**
   * The total under the period row, which opens Insights: what it shows, as an ordinary line with
   * `plain`, and what a screen reader reads for it. Without it the list shows no period row.
   */
  total?: {
    value: string;
    plain?: boolean;
    accessibilityLabel: string;
    onPress: () => void;
  };
  /** What stands under the total and stays while the periods change. */
  summary?: ReactNode;
  /** What stands in place of the cards when the list has none to show in any period. */
  message?: ReactNode;
  card: (expense: ExpenseView) => ReactNode;
}

/**
 * A list of expense cards that shows one period at a time: the period row, the dates of a custom
 * range, the total, and the cards of the period under the date of each day, of which only those
 * on and near the screen are drawn (LEDGER-118.1). Everything scrolls together.
 */
export function PeriodList({ backSwipe, ...props }: PeriodListProps) {
  return (
    <SwipeListScope backSwipe={backSwipe}>
      <PeriodListBody {...props} />
    </SwipeListScope>
  );
}

function PeriodListBody({
  periods,
  top,
  total,
  summary,
  message,
  card,
  onScroll,
  scrollEventThrottle,
}: Omit<PeriodListProps, 'backSwipe'>) {
  const colors = useThemeColors();
  const latestOnScroll = useRef(onScroll);
  useLayoutEffect(() => {
    latestOnScroll.current = onScroll;
  });
  const scrolled = useCallback<NonNullable<typeof onScroll>>(
    (event) => latestOnScroll.current?.(event),
    [],
  );
  const { steps } = periods;
  const shown = periods.shown ?? NO_EXPENSES;
  // One sideways swipe for the top of the list and all that slides with it (LEDGER-114.1): to the
  // right for the period before, to the left for the one after. A period with neither keeps no
  // drag, so that iOS's back gesture gets one to the right on a pushed screen.
  const swipe = usePeriodSwipe({
    selectedKey: periods.name,
    previous: steps ? 'previous' : undefined,
    next: steps?.next ? 'next' : undefined,
    enabled: steps !== undefined,
    scrollGesture: useListScrollGesture(),
    onSelect: (key) =>
      key === 'previous' ? steps?.previous() : steps?.next?.(),
  });
  // Whatever the period, a sideways drag is no press on the total or the name. The swipe sees to
  // that where there is one; where there is none, the top of the list takes the drag itself. Not
  // both: on Android, taking the drag here can cancel the swipe that has just begun.
  const dragIsNoPress = useSidewaysDragIsNoPress();

  // The dates of a custom range take their place at once. What is under them starts where it
  // was and moves to its new place, while the dates fade in or out (LEDGER-113.1).
  const hasRange = total !== undefined && periods.range !== undefined;
  const shift = useSharedValue(0);
  const rangeHeight = useRef(50);
  const hadRange = useRef(hasRange);
  useLayoutEffect(() => {
    if (hadRange.current === hasRange) return;
    hadRange.current = hasRange;
    shift.value = hasRange ? -rangeHeight.current : rangeHeight.current;
    shift.value = withTiming(0, { duration: RANGE_SHIFT });
  }, [hasRange, shift]);
  const { offset } = swipe;
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { translateY: shift.value }],
  }));
  const shiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }],
  }));

  const arrow = (
    label: string,
    icon: SymbolViewProps['name'],
    to: 'previous' | 'next',
    enabled: boolean,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      // The new period slides in from the side its arrow is on (LEDGER-115.1).
      onPress={() => swipe.step(to, to === 'previous' ? -1 : 1)}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
    >
      <SymbolView
        name={icon}
        size={15}
        weight="semibold"
        tintColor={enabled ? colors.text : colors.placeholder}
      />
    </Pressable>
  );

  const header = (
    <>
      {top}
      {total && (
        <GestureDetector gesture={swipe.pan}>
          <View
            collapsable={false}
            style={styles.overview}
            {...(steps ? {} : dragIsNoPress)}
          >
            {/* As wide as the list, so the arrows stay under the finger from month to month. */}
            <GlassSurface style={styles.capsule}>
              {steps &&
                arrow(
                  'Previous period',
                  { ios: 'chevron.left', android: 'chevron_left' },
                  'previous',
                  true,
                )}
              {/* Clipped, so the name slides under the arrows and not over them. */}
              <View style={styles.period}>
                <PeriodName
                  name={periods.name}
                  options={PERIOD_OPTIONS}
                  selected={periods.option}
                  slideStyle={swipe.nameStyle}
                  onSelect={periods.choose}
                  onOpenFilters={periods.openFilters}
                />
              </View>
              {steps &&
                arrow(
                  'Next period',
                  { ios: 'chevron.right', android: 'chevron_right' },
                  'next',
                  steps.next !== undefined,
                )}
            </GlassSurface>
            {periods.range && (
              <Animated.View
                entering={FadeIn.duration(RANGE_SHIFT)}
                exiting={FadeOut.duration(120)}
                onLayout={(event) => {
                  rangeHeight.current =
                    event.nativeEvent.layout.height + styles.overview.gap;
                }}
              >
                <DateRange
                  from={periods.range.from}
                  to={periods.range.to}
                  maximumDate={periods.day}
                  onChange={periods.setRange}
                />
              </Animated.View>
            )}
            <Animated.View style={pageStyle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={total.accessibilityLabel}
                accessibilityHint="Opens Insights"
                onPress={total.onPress}
                style={({ pressed }) => [
                  styles.total,
                  pressed && styles.pressed,
                ]}
              >
                <FadeText
                  containerStyle={styles.shrinks}
                  minFontSize={20}
                  style={[
                    total.plain ? styles.count : styles.amount,
                    { color: colors.text },
                  ]}
                >
                  {total.value}
                </FadeText>
                <Text accessible={false} style={{ color: colors.textMuted }}>
                  ›
                </Text>
              </Pressable>
            </Animated.View>
            {summary && (
              <Animated.View style={[styles.summary, shiftStyle]}>
                {summary}
              </Animated.View>
            )}
            {periods.empty && (
              <Animated.View style={pageStyle}>
                <EmptyPeriod {...periods.empty} />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
      )}
      {message}
      {/*
        The cards are a list of their own inside the screen's list, which scrolls them and tells
        them where the screen is. So one view around them all slides them with the period: a view
        that moves on each card is not let go when its card leaves the screen, and scrolling
        through 2,000 expenses and back cost 260 MB more.
      */}
      <Animated.View style={pageStyle}>
        <FlatList
          data={shown}
          keyExtractor={expenseId}
          renderItem={renderRow}
        />
      </Animated.View>
    </>
  );

  return (
    <ListParts.Provider
      value={{
        header,
        row: (expense, index) => (
          <>
            <DateHeading expense={expense} previous={shown[index - 1]} />
            {card(expense)}
          </>
        ),
      }}
    >
      {/* Everything is the list's header: the list is here to scroll, and for the cards' list. */}
      <SwipeFlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={scrolled}
        data={NO_EXPENSES}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
      />
    </ListParts.Provider>
  );
}

/** In place of the cards when the period holds no expense (LEDGER-116.1). */
function EmptyPeriod({
  name,
  earlier,
}: {
  /** What the period is called. */
  name: string;
  /** An earlier period that holds expenses, and the way to it. */
  earlier?: { name: string; show: () => void };
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.empty}>
      <SymbolView
        name={{ ios: 'calendar', android: 'calendar_today' }}
        size={44}
        tintColor={colors.textMuted}
      />
      <Text
        accessibilityRole="header"
        style={[styles.emptyTitle, { color: colors.text }]}
      >
        {`No Expenses in ${name}`}
      </Text>
      {earlier && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show ${earlier.name}`}
          onPress={earlier.show}
          style={({ pressed }) => [styles.show, pressed && styles.pressed]}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>
            {`Show ${earlier.name}`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  overview: { marginBottom: 24, gap: 6 },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  arrow: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  period: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    overflow: 'hidden',
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  shrinks: { flexShrink: 1 },
  // Apart from the total above it, as the cards are.
  summary: { marginTop: 18 },
  amount: { fontSize: 34, fontWeight: '700' },
  count: { fontSize: 20, fontWeight: '600' },
  pressed: { opacity: 0.4 },
  // Room under the words for a swipe to land on.
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 160,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  show: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
});
