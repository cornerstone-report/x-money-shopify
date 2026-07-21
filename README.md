# X Money for Shopify

**Reconciliation for independent Shopify sellers who take X Money — without a SaaS middleman.**

[![v0.1.0](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/cornerstone-report/x-money-shopify)
[![MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![0-code](https://img.shields.io/badge/built-0--code%20%2B%20Grok%20Build-black)](https://x.ai)
[![Privacy-first](https://img.shields.io/badge/privacy-maximal-important)](#privacy)

Open source. MIT. **Built 100% with Grok Build under a 0-code protocol** (humans set vision and QC; the model writes the code). No telemetry. No analytics. No upsells.

---

## Why this exists

Independent sellers should be able to take **X Money** without renting a bloated “payments OS” that hoards customer data and charges rent forever.

**X still has no public merchant API.** Until it does, the honest job is simple:

1. Detect X Money checkouts on Shopify  
2. Issue a clean **`XM-XXXXX`** reference  
3. Show the buyer what to send (and to whom)  
4. Let the merchant **Mark paid** when funds land  

That is the whole product. Built for the little guy, free market, and people who prefer tools they can audit.

---

## What works (v0.1)

| Feature | Status |
|---------|--------|
| Settings: merchant **X handle** | Done |
| `orders/create` → detect **X Money** manual method | Done |
| Clean **`XM-XXXXX`** references | Done |
| Pending dashboard + one-click **Mark paid** | Done |
| Local orders history (no customer PII) | Done |
| Order tag `x-money` + note with reference | Done (best-effort Admin API) |
| Thank you / Order status **payment instructions** block | Done (all Shopify plans) |
| Hard wipe on uninstall / `shop/redact` | Done |

---

## Honest limitations

**X has no public merchant API yet.**

This app does **not**:

| Claim | Reality |
|-------|---------|
| Connect to X | No |
| Verify transfers | No |
| Move money | No |

You still:

1. Confirm payment yourself in X (match the **XM** reference)  
2. Click **Mark paid** in the app  

When X ships a real merchant API, this repo can grow. Until then: **reconciliation only** — not a fake “official integration.”

Also note:

- Thank you block needs **checkout UI network access** allowed (Partners → API access)
- Local Cloudflare tunnels can drop webhooks; restart `shopify app dev` if deliveries miss
- SQLite by default (single instance). Change Prisma provider for multi-instance production

---

## Privacy

Privacy is not a marketing line. It is the data model.

| Rule | Practice |
|------|----------|
| Zero customer PII | No names, emails, phones, or addresses in the app DB |
| Minimal storage | Shop domain, X handle, order ID/name, amount, currency, XM ref, status, timestamps + OAuth sessions Shopify requires |
| Hard delete | Uninstall / `shop/redact` → hard-delete all app rows for that shop |
| No telemetry | No analytics SDKs, no phone-home |
| Shopify stays Shopify | Tags, notes, metafields live in Admin (merchant-owned) — not a second dossier here |

Schema: `prisma/schema.prisma`.

---

## Merchant flow

```text
Buyer checks out with manual "X Money"
        ↓
App issues XM-XXXXX  ·  tags order  ·  Thank you block shows amount + ref + @handle
        ↓
Buyer sends X Money with that reference
        ↓
You confirm in X  →  Mark paid in the app
```

**Tip:** Keep the Shopify payment-method blurb short  
*(“You’ll get amount and XM reference on the Thank you page.”)*  
The extension carries the live details — don’t duplicate them at checkout.

---

## Install & run

**Prerequisites:** Node `>=20.19 <22 || >=22.12` · [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) · Partner account + dev store

```bash
# 1. Clone & install
git clone https://github.com/cornerstone-report/x-money-shopify.git
cd x-money-shopify
npm install
npx prisma generate && npx prisma migrate deploy

# 2. Link app (or fill .env from Partners)
cp .env.example .env
npx shopify auth login
npx shopify app config link

# 3. Dev
npm run dev
```

**Scopes (minimal):** `read_orders,write_orders`

**After first install:**

| Step | Action |
|------|--------|
| 1 | App → **Settings** → save X handle (rewrites live `app_url` + handle metafields) |
| 2 | Admin → Payments → manual method named **`X Money`** |
| 3 | Checkout editor → Thank you / Order status → add **X Money payment instructions** |
| 4 | Partners → API access → allow **network access** for checkout UI extensions if prompted |

**Production:**

```bash
npm run build && npm run setup && npm start
```

Point Partner URLs/webhooks at your host. Never commit `.env`.

---

## Project layout

```text
app/routes/          # Admin UI, webhooks, extension API
app/utils/           # XM refs, payment detect, metafields, wipe
extensions/
  x-money-instructions/   # Thank you + Order status block
prisma/schema.prisma
```

---

## Roadmap — When X ships a merchant API

This app is deliberately built as a clean reconciliation layer. The moment X exposes a real public merchant / payment-request API, the intended next steps are:

1. **Payment request generation**  
   Create a real X Money payment request (amount + reference + optional note) instead of relying on manual P2P + copy-paste.

2. **Optional auto-matching**  
   If X provides webhooks or a status endpoint, match incoming payments to `XM-XXXXX` references and surface them in the dashboard (still with merchant confirmation by default).

3. **Keep the manual path**  
   Manual Mark paid stays available. Not everyone will want full automation, and privacy-conscious sellers should retain control.

4. **No forced SaaS**  
   The open-source, self-hosted model remains the default. Any future hosted option would be optional, not required.

Until that API exists, v0.1 stays focused on what actually works today: clean references, clear buyer instructions, and a simple merchant dashboard.

---

## Contributing

- Minimal data model. New fields need a privacy justification.
- No analytics, trackers, or unnecessary third parties.
- Stay honest about what X does and does not provide.

## License

[MIT](./LICENSE)

## Disclaimer

Not affiliated with X Corp or Shopify Inc. “X Money” here means the payment method merchants configure for receiving funds via X — not an official product integration. Use at your own risk.

---

## Call to action

If you sell on Shopify and want clean X Money reconciliation without the bloat:

**Clone it. Run it. Own your stack.**

Issues and PRs that respect privacy maximalism and 0-code honesty are welcome.

```bash
git clone https://github.com/cornerstone-report/x-money-shopify.git
```
