# ADR-0022: Every API route takes signed requests unless it is public

- Date: 2026-11-18
- Status: Accepted

## Context

ADR-0015 decides how a phone signs a request and what the API checks: the signature, a timestamp within 5 minutes, a nonce it has not seen, 60 requests a minute for each device, and a limit on registrations for each IP. #127 is the first issue to build this, and every later API route inherits what it builds. ADR-0015 leaves open:

- Which requests are checked, and who makes sure a route added later is.
- What a refusal looks like, and which refusals the phone acts on.
- What a refused request leaves behind. If it stored its nonce or counted towards the limit, anyone could use up a device's 60 requests by sending unsigned requests under its device ID.
- Where the API's time and the client's address come from. Only an entry file may know its runtime (ADR-0007), and a test has to set both.
- What the phone does when it cannot read its seed. `expo-secure-store` answers "no such entry" after a restore to another phone, and reports an error before the phone is first unlocked after a reboot.

Also considered:

- Checking the signature in each route: a route written later can forget to.
- A route that exists only so that tests can send a signed request to it: the API would ship a route nobody uses.
- One refusal with no reason: the phone has to tell a wrong clock from too many requests.
- Letting the phone send again until the API accepts: a server that keeps refusing would keep the phone sending.
- Counting requests in fixed minutes: a phone could send 120 requests around the turn of a minute.

## Decision

On the API:

- The checks run before routing, on every request, including one for a path that has no route. A route is public only when a requirement says so, as the sharing spec says of `GET /health`. A new route is checked unless someone decides otherwise.
- The checks run in one order: the four fields, the device and its signature, the clock, the nonce, the request limit. The first one that fails gives the refusal its reason. A registration is also checked for its body, right after the fields, since the key that verifies it is in the body, and for the limit of its IP, last, so that a phone with a wrong clock is told its clock first and corrects it. A refused request changes nothing in the database: no nonce is kept and nothing is counted.
- A refusal is a JSON body with a reason, under an HTTP status. The reasons, the statuses, the header names of the four fields, and the function that builds the bytes to sign are defined once, in `packages/domain`'s API entry, which the phone and the API both import (ADR-0007). That function takes the body's SHA-256 instead of the body, so the entry needs no hash of its own: each side hashes the body with what its runtime has.
- Both limits count what the API accepted within the window that ends now, 60 seconds for a device's requests and an hour for an IP's new devices, and hold for requests that arrive together. An IPv6 address counts by its first 64 bits, since one network holds all the addresses behind them.
- The entry file gives the app its time, the address a request came from, and the key of the keyed hash that stands for an IP (ADR-0015). On Workers the address is `CF-Connecting-IP` and the key is a secret of the Worker; on Node the address is the connection's. Tests set all three through the Node entry file. Without the key or the address the API registers no new device, rather than register without a limit.
- A path is signed and verified as text, so it is limited to what no URL parser, HTTP client or proxy rewrites on the way: letters, digits and a few marks, with no `//` and no dot segments.

On the phone:

- One function sends every request to the API. On first use it makes the device identity and registers it; it signs each request; and it acts on the two refusals it can do something about, once each for a request: for the clock it takes the API's time and sends again, and for too many requests it waits as long as the API said and sends again. Every other answer goes back to the caller as it is.
- The phone stores the seed before it saves the device ID. A run that stops in between leaves an entry no device ID points to, which is ignored, as ADR-0015 ignores the one an earlier install leaves.
- A phone has lost its authorization when its local data has a device ID and the secure store has no seed for it. An error from the secure store is not that: the request fails, and the phone tries again later.

## Consequences

- A route that takes requests from something other than the app, such as the download page and the files that verify the domain (#137), has to be declared public in its requirement.
- A browser that opens a path with no route gets a refusal, not "not found".
- Each environment needs one more secret, the key for the IP hash, before the first deploy that has registration. Changing it forgets the registrations counted so far.
- A change that makes the Workers entry file pass these to the app has to run the check of `AGENTS.md` rule 9.
- Every accepted request takes a lock on its device and writes a row, which ADR-0015 already accepts. Expired rows and IP hashes stay until #155 clears them.
- More than 30 new phones behind one IPv4 address within an hour are refused until the hour has passed, which a carrier's shared address or a large event can reach.
- A phone that has lost its authorization cannot get a new identity yet. Taking over a member with a new phone (#144) decides how it does.
- The seed's box key (ADR-0015) is derived by the first issue that uses it, with a purpose of its own.
