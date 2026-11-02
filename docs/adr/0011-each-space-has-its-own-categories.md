# ADR-0011: Each space has its own categories

- Date: 2026-11-02
- Status: Accepted

## Context

The default categories are one set that every scope lists: renaming or recoloring one in Group Categories changes it in Manage Categories and in every group (CATEGORIES-29.1). ADR-0009 made category names and colors unique among all categories in the local data, whatever their scope. #14 adds archiving and deleting categories, and moving a category's expenses to another one. On the shared set these would cross scopes too: archiving Shopping in Manage Categories would take it away from every group, and moving Shopping's expenses would move the expenses of every space that uses it. The owner wants a change that one space makes to its categories to leave every other space alone, so that a personal choice never overrides a group's.

The shared set has two more costs:

- The 13 palette colors less the 9 default categories leave 4 colors for all the categories users add, across the whole app (ADR-0009). Two personal categories and two of one group's use them up.
- Each phone creates its default categories with IDs of its own. Once cloud sharing lets members record expenses in the same group on their own phones (roadmap), a group expense that stores one of these IDs points at a category the other members' phones do not have.

Categories of different spaces still meet in personal views: personal Insights counts your share of group expenses (INSIGHTS-1.1) and shows each category with its current name and color (INSIGHTS-7.1). No release contains the categories migration yet, so it can still change (ADR-0006).

Also considered:

- Archiving a shared default per scope: renaming would stay app-wide while archiving would not, and the colors and IDs would stay as they are.
- Fixed default categories that nobody can change, as in Splitwise: the simplest to share, but it undoes #13's decision that defaults can be renamed and recolored, and the baseline's deletable defaults.

## Decision

- Each space, your personal space and each group, has categories of its own. A space starts with its own copy of the nine default categories (CATEGORIES-2.1): the personal space when the app first starts, a group in the same write that creates it. Each space has its own Uncategorized.
- A category belongs to one space. Manage Categories lists the personal space's categories and Group Categories the group's. Renaming or recoloring a category, and archiving it, deleting it, or moving its expenses (#14), change that space only.
- Names and colors are unique within a space: the mobile app compares a category only with the other categories of its space. This supersedes ADR-0009.
- An expense uses a category of its own space: a personal expense one of the personal space's, a group expense one of its group's (#24).
- Where one view combines several spaces, categories with the same name, compared as CATEGORIES-4.1 compares names, count as one category: personal Insights shows a single row for your Food & Dining and Brisbane's. The row takes the name and color of your personal category when there is one, else those of the group created first. Neither colors nor the default a category was copied from count: a group's Food & Dining renamed Snacks is Snacks.
- When a group is shared, its categories go with it; how members' changes to them merge is for the sync design.

## Consequences

- No change to one space's categories reaches another space. Someone who renames Food & Dining to Meals in Manage Categories still sees Food & Dining in every group until they rename it there.
- Each space has 4 palette colors for the categories users add. Personal Insights can show two rows in the same color under different names, such as your Gym and Brisbane's Hotels, until custom colors arrive (#41); sync would bring such clashes anyway.
- A group's categories get their IDs when the group is created, so they can travel with the group and its expenses once sync arrives.
- Creating a group also writes its nine categories, and a failed write leaves neither behind.
- The requirements written for the shared set change, CATEGORIES-29.1 goes, and personal expenses stop offering group categories.
- Turning a personal expense into a group expense (#24) has to swap its category for one of the group's, the one with the same name when the group has it; #24 decides the rest.
- INSIGHTS-6.1 merges categories by ID. The issue that first puts several spaces in one analysis, which should be #30's Insights screen, changes it to merge by name.
