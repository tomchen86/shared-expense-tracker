import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ListRenderItemInfo,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useListOrder } from '../shell';
import { DateField } from '../ui/date-field';
import { DateRange } from '../ui/date-range';
import { FadeText } from '../ui/fade-text';
import { GlassSurface } from '../ui/glass-surface';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderSearch } from '../ui/header-search';
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
  ORDER_NAMES,
  ORDER_OPTIONS,
  orderedCards,
  type ListOrder,
} from './list-order';
import {
  PERIOD_OPTIONS,
  afterComingBack,
  datesOf,
  earlierPeriod,
  emptyPeriodName,
  firstRange,
  hasNext,
  insightsParams,
  monthOf,
  onPeriod,
  optionOf,
  periodName,
  periodOf,
  stepped,
  today,
  type Dates,
  type Period,
} from './list-period';
import { formatItemCount, matchingExpenses } from './list-search';
import type { ExpenseView, GroupWithFormerMembers } from './use-expenses';
import { NO_FILTER } from './list-filter';
import { FilterCapsules, FilterRows, SavedFilterRows } from './list-filter-ui';
import {
  useListFilter,
  type ChangeFilter,
  type ListFilterState,
} from './use-list-filter';

/**
 * The period of one list (LEDGER-107.2) and what it leaves of `expenses`, which are all that the
 * list can show, latest first, or undefined until they are read. A group ID names a group's screen,
 * which opens on all dates and calls them Group Total; the expense list opens on this month.
 * `placed` are the IDs useReadExpenses brought with these expenses.
 */
export function useListPeriod(
  groupId: string | undefined,
  expenses: ExpenseView[] | undefined,
  {
    placed,
    groups,
  }: { placed: readonly string[]; groups: GroupWithFormerMembers[] },
) {
  const inGroup = groupId !== undefined;
  const filter = useListFilter(groupId, expenses, groups);
  const { filtered } = filter;
  const [sheetChanges, setSheetChanges] = useState(0);
  const changeInSheet: ChangeFilter = (update) =>
    filter.change(update, () => setSheetChanges((count) => count + 1));
  const locale = useDisplayLocale();
  const day = today();
  const [list, setList] = useState(() =>
    onPeriod(inGroup ? { kind: 'all' } : monthOf(day), day),
  );
  // A list left on this month or this year is on the new one when the user comes back to the
  // app after the calendar has moved on (LEDGER-146.2). Not while the app stays in front.
  useEffect(() => {
    let away = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') away = true;
      else if (state === 'active' && away) {
        away = false;
        setList((current) => afterComingBack(current, today()));
      }
    });
    return () => subscription.remove();
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { period } = list;
  const dates = datesOf(list, day);
  const from = dates?.from;
  const to = dates?.to;

  const setPeriod = (next: Period) =>
    setList((current) => onPeriod(next, today(), current.range));

  // An expense the user just added or put back stays in sight: one dated outside the period
  // moves the list to its month (LEDGER-117.2). The last one decides.
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
    if (moved) setPeriod(monthOf(moved.date));
  }

  const shown = useMemo(
    () =>
      from === undefined || to === undefined
        ? filtered
        : filtered?.filter(({ date }) => date >= from && date <= to),
    [filtered, from, to],
  );
  const choose = (id: string) => {
    const on = today();
    const next = periodOf(id, on);
    setList((current) =>
      // A custom range has the dates of its last time, or on its first time this month up to
      // today.
      onPeriod(
        next,
        on,
        next.kind === 'custom'
          ? (current.range ?? firstRange(on))
          : current.range,
      ),
    );
  };
  const allName = inGroup ? 'Group Total' : 'All Time';
  const name = periodName(period, day, allName);
  // The list has expenses, but none pass both its dates and its conditions (LEDGER-116.3, LEDGER-138.1).
  const empty = shown?.length === 0 && expenses!.length > 0;
  const earlier =
    empty && dates
      ? earlierPeriod(
          period,
          dates.from,
          filtered!.map(({ date }) => date),
        )
      : undefined;
  const range =
    period.kind === 'custom' ? (list.range ?? firstRange(day)) : undefined;
  const setRange = (next: Dates) =>
    setList((current) => ({ ...current, range: next }));

  const openFilters = () => setFiltersOpen(true);
  return {
    /** The expenses dated in the period, in the order they came; undefined until they are read. */
    shown,
    filter,
    /** Changes that return a scrolled-away period row to view (LEDGER-147.4). */
    key: JSON.stringify([period, range, sheetChanges]),
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
    filterAction: {
      label: filter.active ? 'Filters, on' : 'Filters',
      active: filter.active,
      onPress: openFilters,
    },
    /** Filters, to render over the list's screen. */
    filters: (
      <Filters
        filter={filter}
        change={changeInSheet}
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

/** Date and its optional custom range come before the filter conditions (LEDGER-109.2). */
function Filters({
  filter,
  change,
  visible,
  onClose,
  value,
  selected,
  onChoose,
  range,
  day,
  onRange,
}: {
  filter: ListFilterState;
  change: ChangeFilter;
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
      <SavedFilterRows
        state={filter}
        onApply={(item) => {
          change(item);
          onClose();
        }}
      />
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
      {visible && <FilterRows state={filter} change={change} />}
    </Sheet>
  );
}

/** How long what is under a custom range's dates takes to move when they appear or go (LEDGER-113.1). */
const RANGE_SHIFT = 300;

/**
 * Keeps `into` at the height of the screen's title bar, which changes as a large title closes,
 * without the list rendering again each time it does.
 */
function TitleBarHeight({ into }: { into: RefObject<number> }) {
  const height = useHeaderHeight();
  useLayoutEffect(() => {
    into.current = height;
  });
  return null;
}

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
  'onScroll' | 'scrollEventThrottle' | 'refreshControl'
> {
  periods: ListPeriodState;
  /** Every expense this screen can search, across all dates. Omit when search is unavailable. */
  searchExpenses?: ExpenseView[];
  groupId?: string;
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
 * A list of expense cards for the period or the current search. The header and the dated cards
 * scroll together. Only cards on and near the screen are drawn (LEDGER-118.2).
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
  searchExpenses,
  groupId,
  top,
  total,
  summary,
  message,
  card,
  refreshControl,
  onScroll,
  scrollEventThrottle,
}: Omit<PeriodListProps, 'backSwipe'>) {
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const [searchText, setSearchText] = useState('');
  const query = searchText.trim();
  const { filter } = periods;
  const { filtered } = filter;
  const clear = () => filter.change(() => NO_FILTER);
  const [amountPopoverOpen, setAmountPopoverOpen] = useState(false);
  const showCapsules = filter.active || amountPopoverOpen;
  const matches = useMemo(
    () =>
      query && searchExpenses && filtered
        ? matchingExpenses(filtered, query)
        : undefined,
    [searchExpenses, filtered, query],
  );
  const searching = matches !== undefined;
  const activeText = searching ? searchText : '';
  const latestOnScroll = useRef(onScroll);
  useLayoutEffect(() => {
    latestOnScroll.current = onScroll;
  });
  // Where the list is, and where it rests: under a see-through title bar that is a negative
  // offset, which the list reports as it opens.
  const position = useRef<{ y: number; rest: number }>(undefined);
  const scrolled = useCallback<NonNullable<typeof onScroll>>((event) => {
    const { y } = event.nativeEvent.contentOffset;
    position.current = { y, rest: position.current?.rest ?? Math.min(y, 0) };
    latestOnScroll.current?.(event);
  }, []);

  const list = useRef<FlatList<ExpenseView>>(null);
  const titleBarHeight = useRef(0);
  const rowTop = useRef<number>(undefined);
  const rowHeight = useRef(0);
  const previous = useRef({ period: periods.key, text: activeText });
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { period: periods.key, text: activeText };
    const at = position.current;
    if (at === undefined) return;
    // Editing or ending a search returns to the top (LEDGER-148.1). Changing dates or a condition
    // in Filters does so only with the period row entirely out of sight (LEDGER-147.4).
    if (last.text === activeText) {
      if (
        activeText ||
        last.period === periods.key ||
        rowTop.current === undefined
      )
        return;
      const covered = Math.min(-at.rest, titleBarHeight.current);
      if (at.y + covered < rowTop.current + rowHeight.current) return;
    }
    // Animated: iOS then opens a large title that had closed, as when a finger scrolls there. A
    // jump to the same offset opens it too, and leaves the content the title's height too low.
    list.current?.scrollToOffset({ offset: at.rest, animated: true });
  }, [activeText, periods.key]);
  const { steps } = periods;
  const { order: savedOrder, save } = useListOrder(groupId);
  const [order, showOrder] = useOptimistic(savedOrder);
  const chooseOrder = (id: string) => {
    if (id === order) return;
    const next = id as ListOrder;
    startTransition(async () => {
      showOrder(next);
      try {
        await save(next);
      } catch {
        Alert.alert(
          'Unable to Save Settings',
          'Your settings could not be saved. Please try again.',
        );
      }
    });
  };
  const cards = matches ?? periods.shown ?? NO_EXPENSES;
  const shown = useMemo(
    () => orderedCards(cards, order, groupId !== undefined),
    [cards, order, groupId],
  );
  // One sideways swipe for the top of the list and all that slides with it (LEDGER-114.2): to the
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
  const noticeSwipe = usePanGesture(swipe.panConfig);
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
      {!searching && total && (
        // Measured out here: inside, a view is laid out against the gesture detector's own.
        <View
          onLayout={(event) => {
            rowTop.current = event.nativeEvent.layout.y;
          }}
        >
          <GestureDetector gesture={swipe.pan}>
            <View
              collapsable={false}
              style={styles.overview}
              {...(steps ? {} : dragIsNoPress)}
            >
              {/* As wide as the list, so the arrows stay under the finger from month to month. */}
              <View
                onLayout={(event) => {
                  rowHeight.current = event.nativeEvent.layout.height;
                }}
              >
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
              </View>
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
              {periods.empty && !showCapsules && (
                <Animated.View style={pageStyle}>
                  <EmptyPeriod {...periods.empty} />
                </Animated.View>
              )}
            </View>
          </GestureDetector>
        </View>
      )}
      {showCapsules && (
        <FilterCapsules
          state={filter}
          onAmountPresented={setAmountPopoverOpen}
        />
      )}
      {!searching && showCapsules && periods.empty && (
        <GestureDetector gesture={noticeSwipe}>
          <View collapsable={false} {...(steps ? {} : dragIsNoPress)}>
            <Animated.View style={pageStyle}>
              <EmptyPeriod
                {...periods.empty}
                clear={filter.active ? clear : undefined}
              />
            </Animated.View>
          </View>
        </GestureDetector>
      )}
      {message}
      {matches?.length === 0 && (searchExpenses?.length ?? 0) > 0 && (
        <View style={styles.empty}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search' }}
            size={44}
            tintColor={colors.textMuted}
          />
          <Text
            accessibilityRole="header"
            style={[styles.emptyTitle, { color: colors.text }]}
          >
            {`No Results for “${query}”`}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            {filter.active
              ? 'Filters are on too. Check the spelling, or clear the filters to search every expense.'
              : 'Check the spelling or try a new search.'}
          </Text>
          {filter.active && (
            <NoticeButton label="Clear Filters" onPress={clear} />
          )}
        </View>
      )}
      {/*
        The cards are a list of their own inside the screen's list, which scrolls them and tells
        them where the screen is. So one view around them all slides them with the period: a view
        that moves on each card is not let go when its card leaves the screen, and scrolling
        through 2,000 expenses and back cost 260 MB more.
      */}
      <Animated.View style={searching ? undefined : pageStyle}>
        {shown.length > 0 && (
          <View style={styles.listLine}>
            {(searching || filter.active) && (
              <Text style={[styles.matchCount, { color: colors.text }]}>
                {formatItemCount(shown.length, locale)}
              </Text>
            )}
            <MenuField
              label="Sort By"
              title="Sort By"
              value={ORDER_NAMES[order]}
              options={ORDER_OPTIONS}
              selected={[order]}
              onSelect={chooseOrder}
              trigger={
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={styles.sortButton}
                >
                  <SymbolView
                    name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert' }}
                    size={18}
                    weight="medium"
                    tintColor={
                      order === 'newest' ? colors.textMuted : colors.accent
                    }
                  />
                </View>
              }
            />
          </View>
        )}
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
      {searchExpenses && (
        <HeaderSearch placeholder="Search" onChangeText={setSearchText} />
      )}
      {/* Everything is the list's header: the list is here to scroll, and for the cards' list. */}
      <TitleBarHeight into={titleBarHeight} />
      <SwipeFlatList
        listRef={list}
        refreshControl={refreshControl}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        // Where the list rests under a see-through title bar is above its content, and iOS
        // scrolls there from code only with this.
        scrollToOverflowEnabled
        contentContainerStyle={styles.content}
        ListHeaderComponentStyle={styles.header}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={scrolled}
        data={NO_EXPENSES}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
      />
    </ListParts.Provider>
  );
}

/** The empty period or filter notice, with the nearest earlier period that has a matching card. */
function EmptyPeriod({
  name,
  earlier,
  clear,
}: {
  clear?: () => void;
  /** What the period is called. */
  name: string;
  /** An earlier period that holds expenses, and the way to it. */
  earlier?: { name: string; show: () => void };
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.empty}>
      <SymbolView
        name={
          clear
            ? { ios: 'line.3.horizontal.decrease', android: 'filter_list' }
            : { ios: 'calendar', android: 'calendar_today' }
        }
        size={44}
        tintColor={colors.textMuted}
      />
      <Text
        accessibilityRole="header"
        style={[styles.emptyTitle, { color: colors.text }]}
      >
        {clear ? 'No Matching Expenses' : `No Expenses in ${name}`}
      </Text>
      {clear && (
        <>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Your expenses are still here. No expense matches the filters that
            are on.
          </Text>
          <NoticeButton label="Clear Filters" onPress={clear} />
        </>
      )}
      {earlier && (
        <NoticeButton label={`Show ${earlier.name}`} onPress={earlier.show} />
      )}
    </View>
  );
}

function NoticeButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.show, pressed && styles.pressed]}
    >
      <Text style={{ color: colors.accent, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 112 },
  // The space above the content is the header's, so that what `top` measures of itself, as a
  // group's large title does to tell when it has scrolled away, counts from where the content
  // begins and not from 20 points below it.
  header: { paddingTop: 20 },
  overview: { marginBottom: 24, gap: 6 },
  listLine: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  matchCount: { fontSize: 15, flexShrink: 1 },
  sortButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  emptyHint: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  show: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
});
