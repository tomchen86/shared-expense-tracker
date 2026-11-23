// Every test runs in the same time zone wherever it runs: west of UTC, where a
// date read as UTC midnight falls on the day before.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
  projects: [
    {
      displayName: 'tooling',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/tooling/**/*.test.cjs'],
    },
    '<rootDir>/apps/api/jest.config.cjs',
    ...require('./apps/mobile/jest.config.cjs').projects,
    '<rootDir>/packages/domain/jest.config.cjs',
  ],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/reports/junit' }],
  ],
  coverageDirectory: '<rootDir>/reports/coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    './packages/domain/src/ledger/money.ts': { branches: 100 },
    // Measured using acceptance tests alone, so test:traced enforces these too.
    './packages/domain/src/crypto/index.ts': { branches: 100 },
    './packages/domain/src/groups/amounts.ts': { branches: 100 },
    './packages/domain/src/insights/insights.ts': { branches: 99.1 },
    './packages/domain/src/sync/sync.ts': { branches: 100 },
    // Checks imported amounts and keeps the latest sync stamp across an import.
    './apps/mobile/src/backup/import.ts': { branches: 100 },
    './apps/mobile/src/groups/group-card.tsx': { branches: 83.33 },
    './apps/mobile/src/groups/join-request-cards.tsx': { branches: 86.36 },
    './apps/mobile/src/groups/group-screen.tsx': { branches: 97.18 },
    './apps/mobile/src/groups/group-summary.tsx': { branches: 50 },
    './apps/mobile/src/groups/groups-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/balances-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/format-balance.ts': { branches: 100 },
    './apps/mobile/src/ledger/expenses.ts': { branches: 93.2 },
    './apps/mobile/src/ledger/list-filter.ts': { branches: 100 },
    './apps/mobile/src/ledger/expense-form-screen.tsx': { branches: 97.91 },
    './apps/mobile/src/ledger/use-expense-form.ts': { branches: 92.36 },
    './apps/mobile/src/ledger/use-expenses.ts': { branches: 91.66 },
    './apps/mobile/src/ledger/expense-screen.tsx': { branches: 100 },
    './apps/mobile/src/ledger/expenses-screen.tsx': { branches: 100 },
    // Offline sync: what writes a shared ledger's changes as events and applies the
    // events received, in the sync capability and in the capabilities whose tables it changes.
    './apps/mobile/src/sync/apply.ts': { branches: 100 },
    './apps/mobile/src/sync/index.ts': { branches: 75 },
    './apps/mobile/src/sync/positions.ts': { branches: 75 },
    './apps/mobile/src/sync/records.ts': { branches: 96 },
    './apps/mobile/src/sync/use-synced-focus-effect.ts': { branches: 83.33 },
    // The mark of an expense whose money another phone replaced (ADR-0029): what keeps the
    // phone's own money change and raises the mark, what settles it, and what shows it.
    // No acceptance test presses Use Mine on an expense that is settled already, which
    // review.ts leaves alone, nor holds a button down, which draws it pressed.
    './apps/mobile/src/sync/own-money.ts': { branches: 100 },
    './apps/mobile/src/ledger/review.ts': { branches: 50 },
    './apps/mobile/src/ledger/review-block.tsx': { branches: 90 },
    './apps/mobile/src/ledger/review-mark.tsx': { branches: 100 },
    './apps/mobile/src/groups/review-button.tsx': { branches: 83.33 },
    // Possible duplicates (ADR-0035): the pairing rule, the ledger read and save, and the card.
    './packages/domain/src/sync/duplicates.ts': { branches: 91.66 },
    './apps/mobile/src/sync/duplicates.ts': { branches: 100 },
    './apps/mobile/src/ledger/expense-card.tsx': { branches: 87.5 },
    // The phone's sync with the API (ADR-0027): the loop, the check of unsent stamps, and
    // what starts a sync and shows its notices. Measured with the tests against the API
    // (`*-api.test.*`), which need Docker.
    './apps/mobile/src/sync/loop.ts': { branches: 98.21 },
    './apps/mobile/src/sync/stamps.ts': { branches: 96.42 },
    './apps/mobile/src/sync/use-sync-notices.ts': { branches: 75 },
    './apps/mobile/src/sync/use-sync-triggers.ts': { branches: 93.75 },
    // No acceptance test decodes a character that is cut short; utf8.test.ts reaches every branch.
    './apps/mobile/src/sync/utf8.ts': { branches: 95.83 },
    './apps/mobile/src/ledger/merged-expense.ts': { branches: 100 },
    './apps/mobile/src/ledger/trash.ts': { branches: 83.33 },
    './apps/mobile/src/categories/merged-category.ts': { branches: 100 },
    './apps/mobile/src/categories/repository.ts': { branches: 88.23 },
    './apps/mobile/src/groups/index.ts': { branches: 79.16 },
    // Device identity and signed requests: what lets a phone reach the API that a shared
    // ledger syncs through, and what the API checks before it takes anything (ADR-0015,
    // ADR-0022).
    './packages/domain/src/api/signed-request.ts': { branches: 100 },
    './packages/domain/src/api/join-requests.ts': { branches: 100 },
    './apps/api/src/node.ts': { branches: 63.63 },
    // What every run reaches. The branch left needs two registrations of one device ID to
    // race, so a run that measures 100 reached it by its timing: leave this where it is.
    './apps/api/src/sharing/devices.ts': { branches: 92.85 },
    './apps/api/src/sharing/invite-routes.ts': { branches: 100 },
    './apps/api/src/sharing/ip.ts': { branches: 93.33 },
    './apps/api/src/sharing/join-requests.ts': { branches: 100 },
    './apps/api/src/sharing/request-body.ts': { branches: 100 },
    './apps/api/src/sharing/signed-requests.ts': { branches: 100 },
    './apps/mobile/src/sharing/api-request.ts': { branches: 100 },
    './apps/mobile/src/sharing/device-identity.ts': { branches: 100 },
    // Invite links, join requests and the sync records that carry links between phones.
    './apps/mobile/src/sharing/group-key.ts': { branches: 100 },
    './apps/mobile/src/sharing/invite-api.ts': { branches: 86.2 },
    './apps/mobile/src/sharing/invite-card.ts': { branches: 100 },
    './apps/mobile/src/sharing/invite-link-sheet.tsx': { branches: 100 },
    './apps/mobile/src/sharing/invite-sheet.tsx': { branches: 80 },
    './apps/mobile/src/sharing/invites.ts': { branches: 94.73 },
    './apps/mobile/src/sharing/join-form.tsx': { branches: 92.85 },
    './apps/mobile/src/sharing/join-invite.ts': { branches: 100 },
    './apps/mobile/src/sharing/join-requests.ts': { branches: 92.72 },
    './apps/mobile/src/sharing/refresh-invite-card.ts': { branches: 96.77 },
    './apps/mobile/src/sharing/use-join-group.ts': { branches: 88.26 },
    './apps/mobile/src/sync/invites.ts': { branches: 75 },
    // Admitting a phone (ADR-0039): the roster, the API's four requests about a join request,
    // and what the member's phone and the applicant's phone do with them. No acceptance test
    // takes the API's address or the phone's identity away in the middle of an approval, makes
    // an applicant's name too long for an event, or holds a request's row down.
    './packages/domain/src/api/join-decisions.ts': { branches: 100 },
    './apps/api/src/sharing/decision-routes.ts': { branches: 100 },
    './apps/api/src/sharing/join-decisions.ts': { branches: 100 },
    './apps/mobile/src/sync/roster.ts': { branches: 100 },
    './apps/mobile/src/sharing/join-decisions.ts': { branches: 93.04 },
    './apps/mobile/src/sharing/received-requests.ts': { branches: 93.33 },
    './apps/mobile/src/groups/join-requests.tsx': { branches: 92.85 },
    // The event API: what stores a shared ledger's events, numbers them and hands them
    // out, and the checks of its bodies that the phone and the API share (ADR-0016,
    // ADR-0024).
    './packages/domain/src/api/group-events.ts': { branches: 100 },
    './apps/api/src/sync/groups.ts': { branches: 100 },
    './apps/api/src/sync/routes.ts': { branches: 100 },
    './apps/api/src/cleanup.ts': { branches: 100 },
    './apps/api/src/migrations.ts': { branches: 100 },
    './apps/api/src/sync/migrations.ts': { branches: 100 },
    // The traced Cron test calls scheduled. The branches in this entry file are in fetch.
    './apps/api/src/workers.ts': { branches: 0 },
    // Encrypted ledger snapshots (ADR-0028). The non-acceptance tests also exercise
    // damaged local records and an uploader that has lost its signing identity.
    './packages/domain/src/api/wire.ts': { branches: 100 },
    './packages/domain/src/api/group-snapshots.ts': { branches: 100 },
    './packages/domain/src/sync/snapshot.ts': { branches: 100 },
    './apps/api/src/sync/snapshots.ts': { branches: 100 },
    './apps/mobile/src/sync/snapshot-ledger.ts': { branches: 97.43 },
    './apps/mobile/src/sync/snapshots.ts': { branches: 98.59 },
  },
  testTimeout: 15000,
};
