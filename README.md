# X Money for Shopify

**v0.1.0** — Privacy-first open-source Shopify app for independent sellers who accept **X Money** payments.

Built with **0-code + Grok Build**. MIT. No telemetry.

---

## Current status (v0.1)

What works today:

| Feature | Status |
|---------|--------|
| Save merchant **X handle** (Settings) | Works |
| Detect **X Money** manual payment orders (`orders/create`) | Works |
| Issue clean **`XM-XXXXX`** references | Works |
| Pending payments dashboard + **Mark paid** | Works |
| Orders history (local, no customer PII) | Works |
| Order tag `x-money` + note with reference | Works (best-effort Admin API) |
| Thank you / Order status **payment instructions** block | Works (all plans; needs network access + app URL) |
| Hard wipe on uninstall / shop redact | Works |

---

## Honest limitations

**X has no public merchant API yet.**

This app does **not**:

- Connect to X
- Verify that a transfer happened
- Move money

You still:

1. Confirm payment yourself in X (using the XM reference)
2. Click **Mark paid** in the app

When X ships a real merchant API, this project can grow. Until then: reconciliation tools only — not vaporware “integration.”

Other limits:

- Thank you block needs **checkout UI network access** allowed for the app (Partners → API access)
- During local dev, Cloudflare tunnels can be flaky for webhooks; restart `shopify app dev` if deliveries miss
- SQLite is the default (single instance). Swap Prisma provider for multi-instance production if needed

---

## Privacy

- **Zero customer PII** in the app database (no names, emails, phones, addresses)
- **We only store:** shop domain, X handle, order ID/name, amount, currency, XM reference, status, timestamps, plus OAuth sessions Shopify requires
- **On uninstall / shop redact:** hard-delete all app rows for that shop
- **No** analytics SDKs, telemetry, or phone-home
- Order tag/note/metafields live in **Shopify Admin** (merchant-owned), not as a second customer dossier in our DB

See `prisma/schema.prisma`.

---

## Install & run

### Prerequisites

- Node.js `>=20.19 <22 || >=22.12`
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)
- Shopify Partner account + development store

### Setup

```bash
git clone https://github.com/cornerstone-report/x-money-shopify.git
cd x-money-shopify
npm install
npx prisma generate
npx prisma migrate deploy
```

```bash
cp .env.example .env
# Or link the Partner app:
#   npx shopify auth login
#   npx shopify app config link
```

Scopes (minimal):

```text
read_orders,write_orders
```

### Dev

```bash
npm run dev
```

Then:

1. Open the app → **Settings** → save your X handle (rewrites live `app_url` + handle metafields)
2. Shopify Admin → Settings → Payments → manual method named **`X Money`**
3. Checkout editor → Thank you / Order status → add **X Money payment instructions**
4. Partners → app → API access → allow **network access** for checkout UI extensions if prompted

### Production

```bash
npm run build
npm run setup
npm start
```

Point Partner app URLs and webhooks at your host. Keep secrets in the environment; never commit `.env`.

---

## Merchant flow (short)

1. Buyer checks out with manual **X Money**
2. App creates **`XM-…`**; Thank you block shows amount, reference, handle
3. Buyer sends X Money with that reference
4. You confirm in X → **Mark paid** in the app

Keep the **Shopify payment method** instructions short (point buyers to the Thank you page). The extension carries the live details.

---

## Project layout

```text
app/
  routes/
    app._index.tsx                 # Pending + Mark paid
    app.settings.tsx               # X handle + app URL
    app.orders.tsx                 # History
    api.x-money.instructions.tsx   # Extension session-token API
    webhooks.orders.create.tsx
    webhooks.app.uninstalled.tsx
    webhooks.shop.redact.tsx
  utils/
    x-money.server.ts
    xm-reference.server.ts
    shopify-order.server.ts
    metafields.server.ts
    shop-data.server.ts
extensions/x-money-instructions/   # Thank you + Order status
prisma/schema.prisma
```

---

## Contributing

- Keep the data model minimal; new fields need a privacy justification
- No analytics or unnecessary third-party services
- Stay honest about what X does and does not provide

## License

[MIT](./LICENSE)

## Disclaimer

Not affiliated with X Corp or Shopify Inc. “X Money” means the payment method merchants configure for receiving funds via X — not an official product integration. Use at your own risk.
