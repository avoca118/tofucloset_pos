# Tofu's Closet POS

A runnable Phase 1 MVP for Tofu's Closet: POS, preorder order management, inventory, payments, finance reports, audit logs, cargo batches, returns, refunds, CSV exports, and printable receipts.

## Run

```bash
npm run dev
```

Open `http://localhost:8800`.

Demo logins:

- Owner: `owner@tofuscloset.local` / `owner123`
- Staff: `staff@tofuscloset.local` / `staff123`

Data is stored in `data/store.json` and seeded automatically on first run.

## Test

```bash
npm test
```

The tests cover order creation, inventory reservation, order editing, cancellation stock restoration, payments, delivery finalization, returns, refunds, and profit reporting.
