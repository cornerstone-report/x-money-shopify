# X Money for Shopify

Privacy-first open-source Shopify app for independent sellers who accept **X Money** payments.

Built with **0-code methodology** driven by **Grok Build** (xAI). Strategic direction and QC by humans. MIT licensed. No telemetry. No analytics. No dark patterns.

---

## What this is

A small embedded Shopify app that:

1. Lets you store **one setting**: your public **X handle** (where buyers send X Money).
2. Listens for Shopify `orders/create` webhooks.
3. When the order’s payment method is **X Money**, creates a pending record with a clean reference: **`XM-XXXXX`**.
4. Shows a **pending payments** dashboard with one-click **Mark paid**.
5. Keeps a simple **orders history** for reconciliation.

That’s it.

---

## Honest limits (read this)

**X has no public merchant API yet.**

This app does **not** connect to X, verify transfers, or move money. You:

- Create a Shopify **manual payment method** named `X Money`
- Tell buyers to pay your X handle and include the `XM-…` reference
- Confirm receipt in X yourself
- Click **Mark paid** here (optionally marks the Shopify order paid)

When X ships a real merchant API, this project can grow. Until then, honesty over vaporware.

---

## Privacy maximal

- We store **zero customer PII**
- We only store: shop domain, X handle, order ID/name, amount, currency, reference, status, timestamps
- On uninstall/redact everything is **hard-deleted**

Also:

| Principle | Practice |
|-----------|----------|
| No telemetry | No analytics SDKs, no phone-home, no usage tracking |
| Local DB default | **SQLite** via Prisma |
| Open deps only | Shopify Remix stack + Prisma. Nothing else |
| OAuth sessions | Shopify requires a `Session` row for embedded auth; it is hard-deleted with the rest on uninstall/redact |

### What stays in Shopify (not in our DB as a customer dossier)

When an X Money order is created, the app best-effort writes merchant-facing annotations **on the Shopify order only**:

- Tag: `x-money`
- Note line: `X Money reference: XM-XXXXX`
- After Mark paid: note line `Marked paid via X Money app`

Those live in Shopify Admin for staff. We do not copy customer names, emails, phones, or addresses into our database.

### Hard delete on leave

`deleteAllShopData(shop)` runs on **app uninstall** and **shop/redact**. Hard `deleteMany` for:

1. All `PendingXMoneyPayment` for that shop  
2. The `ShopSettings` row  
3. All `Session` rows for that shop  

No soft-delete flags. Nothing left for that shop domain.

### Data model

- **`Session`** — required Shopify OAuth sessions  
- **`ShopSettings`** — `shop` + `xHandle` only  
- **`PendingXMoneyPayment`** — reconciliation rows (pending/paid)

See `prisma/schema.prisma`.

---

## Stack

- [Shopify App Remix](https://github.com/Shopify/shopify-app-template-remix) (`@shopify/shopify-app-remix`)
- React + Polaris + App Bridge
- Prisma + SQLite
- Node 20+ / 22+

---

## Setup

### Prerequisites

- Node.js `>=20.19 <22 || >=22.12`
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)
- A Shopify Partner account and a dev store

### Install

```bash
git clone https://github.com/cornerstone-report/x-money-shopify.git
cd x-money-shopify
npm install
npx prisma generate
npx prisma migrate deploy
```

### Configure

```bash
cp .env.example .env
# Fill SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES, SHOPIFY_APP_URL
# Or use: npm run env / shopify app config link
```

Scopes (minimal):

```text
read_orders,write_orders
```

- `read_orders` — order webhooks + context  
- `write_orders` — tag/note the order with the XM reference; Mark paid (`orderMarkAsPaid` + note)  

### Dev

```bash
npm run dev
```

Shopify CLI will tunnel, install on your dev store, and register webhooks.

### Production notes

- SQLite is fine for a **single instance**. For multi-instance deploy, switch the Prisma `provider` to Postgres (or similar) and point `DATABASE_URL` accordingly. Schema stays the same.
- Set Partner app URLs and webhook endpoints to your host.
- Keep secrets in the environment. Never commit `.env`.

---

## Merchant workflow

1. **Settings** → save your X handle (no `@` needed).
2. In Shopify Admin → **Settings → Payments**, add a **manual payment method** named **`X Money`**.
3. In the checkout editor, add the **X Money payment instructions** block to the **Thank you** and/or **Order status** pages (works on all plans — not Plus-only).
4. When an order arrives with that method, the webhook creates **`XM-XXXXX`**, tags the order `x-money`, appends the reference to the order note, and the Thank you block shows amount + reference + your handle.
5. When funds land on X, open the app → **Mark paid** (local record first; best-effort mark paid + note in Shopify).

### Thank you / Order status extension

Path: `extensions/x-money-instructions/`

- Targets: `purchase.thank-you.block.render`, `customer-account.order-status.block.render`
- Shows only for X Money pending orders (looks up our DB via session-token API)
- Displays amount, `XM-…` reference, merchant handle, copy buttons
- Privacy: zero customer PII in the extension payload

---

## Project layout

```text
app/
  routes/
    app._index.tsx          # Pending payments + Mark paid
    app.settings.tsx        # X handle only
    app.orders.tsx          # History
    webhooks.orders.create.tsx
    webhooks.app.uninstalled.tsx
    webhooks.shop.redact.tsx
    …
  utils/
    x-money.server.ts         # Payment method detection
    xm-reference.server.ts    # XM-XXXXX allocation
    shopify-order.server.ts   # Tag / note / mark-paid Admin helpers
    metafields.server.ts      # Shop/order metafields for the extension
    shop-data.server.ts       # Privacy hard-wipe helpers
  routes/
    api.x-money.instructions.tsx  # Session-token API for the extension
extensions/x-money-instructions/  # Thank you + Order status UI
prisma/schema.prisma
shopify.app.toml
```

---

## 0-code + Grok Build

This repository was scaffolded and implemented under a **0-code** protocol: humans set vision, privacy rules, and QC; **Grok Build** writes the code. The goal is a clean public good for the X community and independent Shopify sellers — not a SaaS extraction layer.

---

## Contributing

- Keep the data model minimal. New fields need a privacy justification.
- No analytics, trackers, or unnecessary third-party services.
- Prefer small, readable PRs with plain-language descriptions.
- Be honest in docs about what X does and does not provide.

---

## License

[MIT](./LICENSE)

---

## Disclaimer

Not affiliated with X Corp or Shopify Inc. “X Money” here means the payment method merchants configure for receiving funds via X, not an official product integration. Use at your own risk.
