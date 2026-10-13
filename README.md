# Hint, Darling

A feminine, coquette-inspired wishlist and gift coordination platform. People
create wishlists for weddings, birthdays, engagements, graduations and other
occasions, share one public link, and guests claim gifts so nobody buys the same
thing twice.

> This repository contains the **project foundation**, **secure cookie-based
> authentication**, **event and wishlist management**, **public wishlist
> viewing and sharing**, **guest gift-claiming**, and the **owner-facing claim
> status dashboard + gift-giver view**. Registration, login, logout, session
> handling, events, wishlists, public guest viewing and claiming (with
> cancellation and concurrency-safe reservations), privacy modes, the owner's
> private claim dashboard and a gift-giver's own-reservations page are all
> implemented.

## Tech stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | Vue 3 + TypeScript + Vite + Tailwind CSS v4 |
| Backend  | Node.js + Express 5 + TypeScript            |
| Database | PostgreSQL                                   |
| ORM      | Prisma                                       |

## Folder structure

```
hint-darling/
├─ client/                  # The Vue app that runs in the browser
│  ├─ src/
│  │  ├─ components/
│  │  │  ├─ ui/             # Design-system primitives (BaseButton, BaseCard, BaseInput, BaseSelect, BaseModal, …)
│  │  │  ├─ decor/          # Bow, heart, floral and gift SVG decorations
│  │  │  ├─ layout/         # TheNavbar, TheFooter
│  │  │  ├─ landing/        # Landing page sections
│  │  │  ├─ events/          # EventCard (with a private claim summary)
│  │  │  ├─ wishlist/        # Wishlist form (incl. privacy mode), item form and item card (with claim status), public gift card, claim dialog, share panel
│  │  │  └─ HealthStatus.vue# Backend/database status widget (dev)
│  │  ├─ views/             # Routed pages (Home, Login, Register, Dashboard, PublicWishlist, ClaimManage, MyClaims, ...)
│  │  ├─ router/            # vue-router config + auth route guard
│  │  ├─ stores/auth.ts     # Reactive session state (no tokens in localStorage)
│  │  ├─ lib/api.ts         # Typed helpers that call the backend (+ CSRF header)
│  │  ├─ lib/claims.ts      # Per-device claim memory (management tokens)
│  │  ├─ lib/share.ts       # Copy / native share / WhatsApp / link helpers
│  │  ├─ lib/usePageMeta.ts # Per-view document head (title + Open Graph tags)
│  │  ├─ assets/main.css    # Tailwind theme (palette, fonts, shadows)
│  │  ├─ App.vue            # Root layout (navbar + router-view + footer)
│  │  └─ main.ts            # Resolves the session, then mounts the Vue app
│  ├─ index.html
│  ├─ vite.config.ts        # Proxies /api to the backend
│  └─ tsconfig*.json
├─ server/                  # The Express API + Prisma
│  ├─ prisma/schema.prisma  # Database schema (models)
│  ├─ prisma/migrations/    # Applied SQL migrations (incl. the partial unique index for claims)
│  ├─ prisma/seed.ts        # Development seed data (demo wishlist + air fryer)
│  ├─ src/
│  │  ├─ lib/               # prisma, password hashing, sessions, tokens, validation, ownership, serializers, public projection, claims, share previews
│  │  ├─ middleware/        # auth (session, CSRF), rate limiting
│  │  ├─ routes/auth.ts     # /api/auth/* endpoints
│  │  ├─ routes/events.ts   # /api/events/* endpoints
│  │  ├─ routes/wishlists.ts# /api/wishlists/* endpoints
│  │  ├─ routes/claims.ts   # /api/claims/* — a signed-in gift-giver's own reservations
│  │  ├─ routes/public.ts   # /api/public/* guest endpoints (view + claim + manage)
│  │  ├─ routes/health.ts   # GET /api/health
│  │  ├─ tests/*.test.ts    # Integration tests for auth, events, wishlists, public viewing, claims and claim-status privacy
│  │  ├─ types/             # Express request augmentation
│  │  ├─ app.ts             # Builds the Express app
│  │  └─ index.ts           # Starts the server
│  ├─ .env.example          # Copy to `.env` (placeholders only)
│  └─ tsconfig.json
├─ package.json             # Workspaces + scripts that run both apps
└─ README.md
```

- **`client/`** is everything the visitor sees. It is a normal Vite + Vue app.
- **`server/`** is the API that talks to PostgreSQL through Prisma.
- The root `package.json` uses **npm workspaces**, so a single `npm install`
  installs both apps.

## Frontend (design system + landing page)

The client ships a small coquette-inspired design system and a landing page.

- **Design tokens** live in `client/src/assets/main.css` under Tailwind's
  `@theme`: blush `#F7DCE7`, soft pink `#F3B8CF`, dusty rose `#C97898`, warm
  cream `#FFF9F5`, white, muted brown `#59454B` and soft sage `#DCE8DC`, plus
  the Cormorant Garamond (display) and Inter (body) font stacks.
- **Reusable primitives**: `BaseButton` (primary / secondary / ghost, and it can
  render as a router link, anchor or button), `BaseCard`, and `BaseInput`.
- **Routes** (vue-router): `/`, `/login`, `/register`, `/dashboard`, `/create`,
  `/about`, `/contact`, `/privacy`, `/terms`, and a catch-all 404.
  - `/login` and `/register` are real forms wired to the API.
  - `/dashboard` is the protected owner area: it lists the signed-in user's
    events with create, view and delete actions. Unauthenticated visitors are
    redirected to `/login?redirect=…`.
  - `/events/new`, `/events/:id` and `/events/:id/edit` manage an event, its
    wishlist and gift items. `/create` redirects to `/events/new`.
  - `/w/:shareToken` is the **public, guest-facing wishlist**. It needs no
    account and is optimised for phones because most guests arrive from a
    WhatsApp link. Guests can read and share the list but never edit it.
  - `/claim/:token` is a gift-giver's private management page (view/release a
    single claim via the one-time token). `/claims` is the signed-in
    gift-giver's **own reservations** page — a list of the gifts they've
    promised to give, with a release action. It only ever shows the caller's
    claims.
  - The event page doubles as the **owner's claim-status dashboard**: each gift
    shows *claimed* or *available*, the owner sees a friendly summary such as
    "Someone's getting you 3 of 5! 🎁", and the main dashboard shows a private
    claimed-count per event. The owner can never see who claimed a gift.
  - The remaining routes show an honest "coming soon" placeholder.
- **Sharing**: owners get a share panel on the event page (copy link, native
  share, WhatsApp, QR code). The same panel appears for guests on the public
  page. Link previews are covered by dynamic Open Graph tags — set client-side
  in the SPA and injected server-side for `/w/:shareToken` when the built client
  is served by the API.
- **Auth state**: `stores/auth.ts` keeps the signed-in user in memory only. The
  session lives in an HTTP-only cookie, so nothing sensitive touches
  `localStorage`. (A guest's claim-management tokens do live in `localStorage`
  — they are the only way to get back to a claim without an account, and the
  server only ever stores their hashes.)
- **Health widget**: `HealthStatus.vue` still exists and calls `GET /api/health`
  but is not shown on the landing page.

Nothing here is faked: navigation is real, forms talk to the API, and the
interactive data is the live health check, authentication, events, wishlists and
public guest viewing.

## Requirements

- Node.js `^22.18.0` or `>=24.12.0`
- npm 10+
- PostgreSQL 14+ (running locally or reachable by URL)

## Installation

```sh
npm install
```

This installs dependencies for **both** workspaces and generates the Prisma
Client.

## Configure the environment

1. Copy the example file:

   ```sh
   cp server/.env.example server/.env
   ```

2. Edit `server/.env` and set a real `DATABASE_URL`:

   ```
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hint_darling?schema=public"
   PORT=3002
   ```

   - `USER` / `PASSWORD` are your PostgreSQL credentials.
   - `hint_darling` is the database name.
   - `PORT` is the port the Express API listens on (default `3002`).

> `server/.env` is git-ignored. Never commit real credentials.

## Setting up PostgreSQL locally

You do **not** need a database to start the app — the health check will simply
report `disconnected` until one exists. When you're ready, here are two common
ways to get one.

### Option A — Homebrew (macOS)

PostgreSQL is already installed in this environment via Homebrew
(`postgresql@18`).

```sh
# Start the database server (runs in the background)
brew services start postgresql@18

# Create the database
createdb hint_darling

# Sanity check: open the psql prompt, then type \q to quit
psql hint_darling
```

Then set your `DATABASE_URL`. With Homebrew's default trust auth and your macOS
username, it usually looks like:

```
DATABASE_URL="postgresql://$(whoami)@localhost:5432/hint_darling?schema=public"
```

### Option B — Docker

If you prefer containers (Docker Desktop must be running):

```sh
docker run --name hint-darling-db \
  -e POSTGRES_USER=hint \
  -e POSTGRES_PASSWORD=hint \
  -e POSTGRES_DB=hint_darling \
  -p 5432:5432 \
  -d postgres:16
```

Then set:

```
DATABASE_URL="postgresql://hint:hint@localhost:5432/hint_darling?schema=public"
```

## Database commands

```sh
npm run db:generate   # Regenerate Prisma Client after changing the schema
npm run db:migrate    # Create/apply a migration (asks for a name)
npm run db:seed       # Insert development seed data (demo wishlist + air fryer)
npm run db:studio     # Open Prisma Studio to browse the data
```

There are no migrations to write by hand: the schema in
`server/prisma/schema.prisma` is the source of truth, and `db:migrate` creates
and applies migrations from it.

### Development seed data

`npm run db:seed` is idempotent and dev-only (it refuses to run when
`NODE_ENV=production`). It creates a demo owner, a wedding event, a public
wishlist and a handful of sample gifts — including the air fryer used to preview
the public cards. The seed prints the public link and the demo sign-in details.
Sample gifts live **only** here; the UI never hard-codes products.

## Database schema

The Prisma schema defines the following models:

| Model          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `User`         | Owner account (`email` is unique; only `passwordHash` is stored).       |
| `Session`      | Server-side session keyed by a SHA-256 digest of the cookie token.      |
| `Event`        | An owner's occasion (wedding, birthday, festive celebration, …).        |
| `Wishlist`     | One list per event, with a unique `shareToken`.                          |
| `WishlistItem` | A gift on a list, with price, preferences and position.                 |
| `GiftClaim`    | A reservation of a gift, by a registered user or a guest (`claimantName`), with a hashed management token and an `idempotencyKey`. |

Each event has **at most one wishlist** (enforced by a unique constraint).
Events, wishlists and items are fully manageable in the UI, and guests can
claim gifts on the public page.

## Gift claiming

A guest opens a shared link, taps **“I’ll get this!”** on a gift, optionally
adds their name (kept private), and confirms. The backend reserves the item in
a single atomic transaction, other guests immediately see the gift as claimed,
and a successful claim returns a private **management link** the gift-giver can
use to view or release their claim later. If someone else claims first, a
request is rejected with `409` and the message
`Oops, someone's got this for them! 🎁` plus a suggestion to choose another gift.

### Concurrency

Claiming is never “check then insert”. A claim runs inside one database
transaction that first takes a `FOR UPDATE` lock on the item row, so two
simultaneous requests for the same gift serialise — the loser re-reads after the
winner commits, sees the winner's active claim and is rejected. As a hard,
database-level guarantee, a **partial unique index**
(`gift_claims_one_active_per_item`, in a hand-written migration because Prisma
cannot express partial indexes) permits at most one `CLAIMED` row per item no
matter what writes to the table. Cancelled claims fall outside that index, so an
item becomes claimable again after a valid cancellation. This first version
allows **one active claim per item** regardless of `quantity`; the public
projection therefore reports availability as a simple *available* / *claimed*
state.

### Idempotency

The client sends an idempotency key with each claim. A duplicate submission
(with the same key, e.g. a double-click or a network retry) returns the original
claim instead of creating a second one, so a gift-giver can never accidentally
reserve the same gift twice — and never loses their management link.

### Claim management token

- When a claim is created, an unguessable 256-bit token is generated. The raw
  token is returned **once**, to the gift-giver, in the claim response.
- Only its **SHA-256 digest** is stored in `claimTokenHash`; a database leak
  reveals no usable tokens, the raw token is never logged, and it never appears
  in any public wishlist response.
- `GET /api/public/claims/:token` and `POST /api/public/claims/:token/cancel`
  require the token, so only the rightful gift-giver can view or release their
  claim. Other guests' attempts return `404`. Owners cannot cancel claims on
  behalf of guests in this version.

### Owner privacy

The public wishlist projection exposes **no gift-giver information** — not even
the optional display name — only whether a gift is claimed. The claimant's
identity stays private for signed-in gift-givers too: their user is recorded
server-side (`claimantUserId`) so the account can be traced if needed, but it is
never serialised into any response the owner or other guests can read.

This is enforced in the **database query itself**, not hidden with Vue. Owner
views (`GET /api/events`, `GET /api/events/:id`, `GET /api/wishlists/:id`) and
the public projection only ever `select` active claim **ids** (plus a count), so
`claimantName`, `claimantUserId` and `claimTokenHash` are never even loaded for
them. The response schemas then surface a simple `isClaimed` / `claimedCount`
and nothing more. The only response that can contain a name is a claimant's own
(`GET /api/claims` and `GET /api/public/claims/:token`), and those are scoped to
that single gift-giver.

### Owner claim-status dashboard

The owner's event page and dashboard summarise reservations without ever
revealing who is behind them:

- each gift card shows a warm **Claimed — someone's getting you this gift! 🎁**
  or **Available** state with a subtle gift icon;
- the event page shows a progress summary ("Someone's getting you 3 of 5! 🎁")
  and a claimed-count meter;
- the events list shows a private "2 of 5 gifts claimed" line per event.

### Gift-giver view

Signed-in gift-givers get `GET /api/claims`, which returns **only their own**
reservations (scoped by `claimantUserId`), and `POST /api/claims/:claimId/cancel`,
which can only release a claim they own — an id they don't own returns `404`.
Another claimant's name, id or token is never returned. Guests without an
account keep using their private management-token link.

### Privacy modes

Each wishlist has a `privacyMode` (`PUBLIC`, `LINK_ONLY`, `PRIVATE`) the owner
can change from the wishlist form:

- **Link only** (default) and **Public** — readable by anyone holding the link.
- **Private** — every public read and claim returns `404` immediately.

The public projection re-reads the mode on every request and is sent with
`Cache-Control: no-store`, so switching a list private (or back) takes effect at
once. The owner's own dashboard is unaffected by the mode; a private list simply
stops showing the share panel and tells the owner guests can't see it yet.

## Authentication

Cookie-based sessions with no tokens in JavaScript.

- **Password hashing**: Argon2id (`@node-rs/argon2`) with OWASP-recommended
  parameters. Plaintext passwords are never stored or logged.
- **Sessions**: a random token is sent in the HTTP-only `hd_session` cookie;
  only its SHA-256 digest is stored in the `sessions` table. Sessions expire
  after 7 days and are deleted on logout (and lazily when expired).
- **CSRF**: a script-readable `hd_csrf` cookie plus a matching `X-CSRF-Token`
  header (double-submit). For signed-in requests the token is also checked
  against the session's stored digest.
- **Validation**: requests are validated server-side with Zod; the API returns
  `{ error: { message, fields } }` for the forms to display.
- **Rate limiting**: `/api/auth/login` and `/api/auth/register` are throttled.

### API endpoints

| Method | Path                 | Description                                  |
| ------ | -------------------- | -------------------------------------------- |
| `GET`  | `/api/auth/csrf`     | Issue/return the CSRF token.                 |
| `POST` | `/api/auth/register` | Create an account and start a session.       |
| `POST` | `/api/auth/login`    | Sign in and start a session.                 |
| `POST` | `/api/auth/logout`   | Invalidate the session and clear cookies.    |
| `GET`  | `/api/auth/me`       | Return the current user, or `401`.           |

No authentication secret needs to be configured: tokens are random opaque
values, and only their digests are persisted.

### Events and wishlists

All of these require a session and are scoped to the signed-in owner. A record
that exists but belongs to somebody else returns `404`, so changing an ID in a
URL never reveals another user's data. Event types are validated against the
enum (`WEDDING`, `BIRTHDAY`, `ENGAGEMENT`, `GRADUATION`, `BABY_SHOWER`,
`HOUSEWARMING`, `FESTIVE`, `ANNIVERSARY`, `CHRISTMAS`, `OTHER`), and product and
image links must be `http`/`https` URLs — unsafe schemes such as `javascript:`
and `data:` are rejected.

| Method   | Path                                          | Description                              |
| -------- | --------------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/events`                                 | List the owner's events.                 |
| `POST`   | `/api/events`                                 | Create an event.                         |
| `GET`    | `/api/events/:eventId`                        | Event detail with wishlist and items.    |
| `PATCH`  | `/api/events/:eventId`                        | Update an event.                         |
| `DELETE` | `/api/events/:eventId`                        | Delete an event (cascades).              |
| `POST`   | `/api/events/:eventId/wishlist`               | Create the event's wishlist.             |
| `PATCH`  | `/api/events/:eventId/wishlist`               | Update title and description.            |
| `GET`    | `/api/wishlists/:wishlistId`                  | Wishlist detail with items.              |
| `PATCH`  | `/api/wishlists/:wishlistId`                  | Update a wishlist.                       |
| `POST`   | `/api/wishlists/:wishlistId/items`            | Add a gift item.                         |
| `PATCH`  | `/api/wishlists/:wishlistId/items/reorder`    | Reorder items by id list.                |
| `PATCH`  | `/api/wishlists/:wishlistId/items/:itemId`    | Update a gift item.                      |
| `DELETE` | `/api/wishlists/:wishlistId/items/:itemId`    | Remove a gift item.                      |

### Public wishlists and sharing

Guests open `/w/:shareToken` — no account, no session. The page shows the event
name and date, the wishlist title and description, and a card per gift (image,
name, preferences, price, product link) with its current availability. Available
gifts carry an **I'll get this!** button that opens a confirmation dialog, lets
the guest add a private gift-giver name, reserves the gift, and hands back a
private management link. Owners and guests can both copy the link, use the
native share sheet, share to WhatsApp with a prefilled message, or scan/download
a QR code.

| Method | Path                                  | Description                                |
| ------ | ------------------------------------- | ------------------------------------------ |
| `GET`  | `/api/public/wishlists/:shareToken`   | Read one shared wishlist as a guest.       |
| `POST` | `/api/public/wishlists/:shareToken/items/:itemId/claims`        | Claim a gift (idempotent; `409` when already claimed). |
| `GET`  | `/api/public/claims/:token`           | View a claim via its private management token. |
| `POST` | `/api/public/claims/:token/cancel`    | Release a claimed gift (requires the token). |

#### Signed-in gift-givers

These require a session and are always scoped to the caller's own claims:

| Method | Path                          | Description                                        |
| ------ | ----------------------------- | -------------------------------------------------- |
| `GET`  | `/api/claims`                 | List the caller's own claims (never anyone else's). |
| `POST` | `/api/claims/:claimId/cancel` | Release one of the caller's own claims.             |

#### Privacy

- Each wishlist has a **cryptographically random 256-bit share token** (32 random
  bytes, base64url). Tokens are validated on the server before any lookup and are
  rate-limited to blunt scraping.
- The public projection deliberately **never exposes** the owner or their email,
  internal wishlist/event ids, the share token, private item `notes`, or **any
  gift-giver information** (only a count of claims, so guests can see
  availability without seeing who claimed what).
- Inactive (`isActive = false`), private (`privacyMode = PRIVATE`), deleted and
  unknown wishlists are indistinguishable: they all return `404`, and the
  response is sent with `Cache-Control: no-store` so a disabled list stops being
  readable immediately.
- Guest mutations are deliberately narrow: the only public write is claiming a
  gift (and releasing one via its private token), both CSRF-protected and
  rate-limited. Every other write path still requires an owner session.
- When the built client is served by the API, `/w/:shareToken` also gets
  per-wishlist Open Graph/Twitter tags so link previews unfurl with the event
  name, wishlist description and a gift image.

## Testing

The server ships integration tests that run the real Express app against
PostgreSQL:

```sh
npm test
```

They cover registration, duplicate-email handling, validation errors, login,
incorrect passwords, user-enumeration resistance, logout/session invalidation,
protected-route access and CSRF rejection — plus event and wishlist management:
creating, editing and deleting an owner's events, adding/editing/removing gift
items, reordering, rejecting unsafe URLs, and confirming that **another user
cannot view, change or delete events, wishlists or items they don't own**.

Public viewing has its own suite: a guest can read a shared list without signing
in; the response leaks no account data, internal ids, private notes or
gift-giver details and reports availability correctly; unknown, malformed,
inactive and deleted tokens all return `404`; tokens are distinct and long; and
guest writes are rejected across the public and owner routes. Claiming is also
integration-tested: happy-path claiming, idempotent double-submits, the friendly
`409` conflict, **simultaneous claims (exactly one wins)**, the one-active-claim
limit for gifts with `quantity > 1`, token-hash storage, management-link viewing
and cancellation (which frees the gift), rejection of wrong/malformed tokens,
owner-privacy assertions, and a database-level unique-constraint test. The
link-preview metadata generator is unit-tested too (title/tags, escaping, no
duplicates).

Claim-status privacy has its own suite that exercises every endpoint as each
role — the **owner**, the **rightful gift-giver**, an **unrelated guest** and an
**unauthenticated visitor**. It asserts that the owner's dashboard and public
list report availability yet never contain a claimant name, user id or token;
that a signed-in gift-giver only ever sees and cancels their own reservations
(and gets `404` for anyone else's); that every owner/gift-giver endpoint rejects
anonymous callers with `401`; and that switching a wishlist to `PRIVATE` hides
it (and refuses claims) at once, then restores access immediately.

The tests need a reachable database (the same `DATABASE_URL`); if PostgreSQL is
unavailable they skip with a clear message instead of failing. Test accounts are
created with unique emails and removed afterwards (deleting a user cascades to
their events, wishlists and items).

## Running the app

Start the frontend and backend together:

```sh
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend:  <http://localhost:3002>
- Health:   <http://localhost:3002/api/health>

You can also run them separately:

```sh
npm run dev:client
npm run dev:server
```

The Vue app requests `/api/health` through Vite's proxy, so the status card on
the home page shows both the backend and the database state.

## Other scripts

```sh
npm run build       # Type-check and build the client, compile the server
npm run type-check  # Type-check both workspaces
npm test            # Run the server integration tests (needs PostgreSQL)
```

## Health endpoint

`GET /api/health` returns:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

`database` is `"disconnected"` when PostgreSQL is not reachable; the endpoint
still responds so the UI can report the problem honestly.
