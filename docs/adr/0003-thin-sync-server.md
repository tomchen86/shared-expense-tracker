# ADR-0003: Thin sync server

- Date: 2026-10-23
- Status: Accepted

## Context

The phone is the source of truth for its data (ADR-0002). The app works offline and needs no sign-up by default (`docs/roadmap.md`). Shared ledgers still need a place where devices that are rarely online at the same time can leave changes for each other.

The baseline's API is a full backend: it keeps its own copy of every expense and checks the money and split rules itself, while the app checks the same rules again. Its expense sync already exchanges changes through a cursor and a client mutation ID.

## Decision

- The API is a thin sync server. It authorizes members and devices, stores and exchanges the change events of each shared ledger, and keeps each device's sync cursor.
- It applies no bookkeeping rules and never needs to read what an event contains; to the API, an event's content is opaque. Every client applies the rules in `packages/domain` and checks each event it receives.
- Every event has a unique ID, so an upload that is retried is stored once, and a device fetches only the events it has not seen.
- Whether event content is end-to-end encrypted is decided in the cloud sharing phase's proposal.

## Consequences

- Bookkeeping rules have one implementation, on the clients. The server holds no readable copy of a ledger, so adding end-to-end encryption later does not change the server.
- The server cannot stop invalid data: an outdated or buggy client can upload an event that breaks a rule, so every client checks what it receives. These checks are part of offline sync, a level-2 area (ADR-0001).
- When two devices change the same record, every client has to merge to the same result. The cloud sharing phase's proposal decides the rule.
- A web version has to download, keep, and merge ledger data itself, as the mobile app does; it cannot just show the server's data.
- Features that need the server to read users' data, such as price statistics across users or running AI in the cloud by default, do not fit this server.
- The baseline API's full backend, with its copy of the data and its rule checks, is not moved. Its cursor-based expense sync is the reference for the sync server.
