# Architecture

The system as it is now, on one page. Reasons live in `docs/adr/`.

```mermaid
flowchart LR
  user([User]) --> mobile[Mobile app]
  mobile --> api[API]
  api --> db[(PostgreSQL)]
  mobile -.-> domain[Domain]
  api -.-> domain
```

| Part | Responsibility | Where |
|---|---|---|
| Mobile app | What a member does on the phone, including offline; syncs with the API | `apps/mobile` |
| API | Accounts, shared spaces, and the server copy of their data | `apps/api` |
| Domain | Rules both apps apply identically, and the API's request and response types | `packages/domain` |

Name top-level directories only. File paths go stale.

## Principles

- Each capability's code lives in one directory per app, named after its spec (ADR-0002).
- A rule both apps apply lives once, in `packages/domain`; neither app redefines it (ADR-0002).
- PostgreSQL is the only database, in tests too (ADR-0002).
