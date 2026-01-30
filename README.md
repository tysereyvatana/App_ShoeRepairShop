# Shoe Repair Shop Suite (Monorepo)

A complete starter system with **enterprise UI** and a clean backend:

- **Client:** React + TypeScript + MUI, React Router, React Query, DataGrid
- **Server:** Fastify + TypeScript + Prisma + PostgreSQL, JWT Auth
- **Roles:**
  - **ADMIN:** full access + user/role management + delete (soft delete)
  - **STAFF:** daily operations (items/customers/suppliers/purchases/service/income). Cannot manage users.

## Modules included
1) User Login Control (CRUD + Search) *(ADMIN only)*
2) Staff Information (CRUD + Search) *(ADMIN manage; STAFF can view)*
3) Customer Information (CRUD + Search)
4) Supplier Information (CRUD + Search)
5) Items Information (CRUD + Search)
6) Purchase Inventory (CRUD + Search + Receive stock)
7) Dashboard (KPIs + counts)
8) Service Tracking (Service orders + parts + payments + status)
9) Manage Income (Payments + Other income + Expenses)

## Shoe repair customizations
- Repair workflow statuses: **RECEIVED → CLEANING → REPAIRING → READY → DELIVERED** (plus CANCELLED)
- **Repair Board** (Kanban)
- **Service Catalog** (repair services with default prices)
- Printables:
  - **Option A:** Tag / Ticket label
  - **Option B:** Invoice / Receipt
  - **Option C:** Tag + Invoice in one print

---

## 1) Requirements
- Node.js 18+ (or 20+)
- PostgreSQL (local install) **or** Docker

---

## 2) Database setup (choose ONE)

### Option A: Local PostgreSQL (recommended if you already use pgAdmin)
1. Create a database named **appdb**
2. Copy env:

```bash
cp server/.env.example server/.env
```

3. Edit `server/.env` and set your `DATABASE_URL`.

> If your password contains special characters (like `@`), you **must URL-encode** them.
> Example password `It@phsme` becomes `It%40phsme`.

Example:

```env
DATABASE_URL="postgresql://postgres:It%40phsme@localhost:5433/appdb?schema=public"
```

### Option B: Docker (PostgreSQL + optional pgAdmin)

```bash
docker compose up -d
```

- Postgres: `localhost:5433`
- pgAdmin: `http://localhost:5050` (admin@example.com / admin123)

---

## 3) Install dependencies (root)

```bash
npm install
```

---

## 4) Prisma migrate + seed

```bash
npm run prisma:migrate -w server
npm run prisma:seed -w server
```

Seed creates:
- username: **admin**
- password: **admin123**

---

## 5) Run dev

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000/health`

**LAN / phone testing:**
- Client dev server is started with `--host` by default, so you can open it from another device:
  - Client: `http://<your-laptop-ip>:5173`
  - API health: `http://<your-laptop-ip>:4000/health`

---

## 6) Production build (single URL for phone)

If you want **one URL** like `http://<your-laptop-ip>:4000/` (so you don't need port 5173):

```bash
npm run build
npm run start
```

Now:
- UI: `http://<your-laptop-ip>:4000/`
- API health: `http://<your-laptop-ip>:4000/health`

> In dev mode (vite), the API root `/` will show a small JSON message. This is normal.


## Notes
- Deletions are soft-delete (sets `deletedAt`).
- UI hides the **Users** menu for non-admin.
- API base URL selection:
  - If `VITE_API_URL` is set, the client uses it (example: `http://192.168.2.25:4000`).
  - Otherwise it falls back to `http://<browser-hostname>:4000/api`.

## Shop branding for receipt/tag prints
To customize the printed **80mm receipt** and **tag**, create `client/.env` (or `client/.env.local`) based on:

```bash
cp client/.env.example client/.env
```

Then edit these values:
- `VITE_SHOP_NAME`
- `VITE_SHOP_PHONE`
- `VITE_SHOP_ADDRESS`
- `VITE_SHOP_LOGO_TEXT`
- `VITE_SHOP_SOCIAL`

Restart the client dev server after changing env values.
