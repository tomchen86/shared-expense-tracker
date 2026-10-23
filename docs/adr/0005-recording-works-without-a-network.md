# ADR-0005: Recording works without a network

- Date: 2026-10-23
- Status: Accepted

## Context

The rebuild proposal has the principle 「沒有網路也能記帳」: recording must never need the network. The rebuild phase has started (milestone 重建), so code written from now on has to follow it, and `skills/start-phase` turns it into a decision here. The phone is the source of truth for its data (ADR-0002), and the server only exchanges sync events (ADR-0003). Offline sync is a level-2 area (ADR-0001).

## Decision

- Every action that records or changes bookkeeping data (expenses, categories, groups, members, settings) works with no network: it reads and writes only the phone's SQLite (ADR-0002).
- The network is used only for sync (ADR-0003). Sync runs on its own and never blocks or delays saving a local change.
- A failed or missing connection never loses a change saved on the phone; it waits to sync later.

## Consequences

- Acceptance tests for these actions need no network.
- A feature that depends on a server, such as cloud services or processing receipts in the cloud, fails on its own when the server can't be reached, and recording keeps working.
- Sync has to pick up the changes saved while offline. Writing a change, its pending upload, and the sync progress in one SQLite transaction (ADR-0002) makes that possible.
