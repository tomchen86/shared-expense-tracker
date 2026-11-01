# ADR-0009: Category names and colors are unique across the app

- Date: 2026-10-31
- Status: Accepted

## Context

Categories belong to a scope: the default categories are shared by every scope, and a category a user adds belongs to their personal scope or to one group's (#15). The name and color rules in `packages/domain` compare a category only with the other categories they are given (CATEGORIES-4.1, CATEGORIES-5.1), so the mobile app decides which ones count: every category in the local data, as the baseline does, or only the default categories and those of the same scope. Comparing within a scope would let every scope use the four palette colors the defaults leave free, and reuse names.

Categories from different scopes meet in personal views. Personal Insights counts your share of group expenses (INSIGHTS-1.1) and shows each category with its current name and color (INSIGHTS-7.1), so a group's categories sit in the same chart as your personal ones. In the baseline, the Expenses tab also lists the group expenses you paid or shared (#24).

## Decision

A category's name and color stay unique among all categories in the local data, whatever their scope: the mobile app compares them with the default categories, your personal categories, and every group's categories.

## Consequences

- Categories that appear together in personal views can always be told apart. Per-scope uniqueness would allow a personal "Rent" and a group "Rent" in the same color, shown as two identical rows in Insights.
- Manage Categories and Group Categories reject names, and disable colors, that categories they do not list already use, without saying which category uses them.
- With 13 palette colors and 9 default categories, the categories users add share 4 colors across the whole app until custom colors arrive (#41).
- Group categories that arrive by sync from other members' phones can clash with this phone's personal categories. Sync is not built yet; its design decides how to handle that.
