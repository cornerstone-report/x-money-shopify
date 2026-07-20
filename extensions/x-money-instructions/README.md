# X Money payment instructions

Checkout UI extension for **Thank you** and **Order status** pages (all Shopify plans — not Plus-only).

## What it shows

Only when the order is a pending X Money payment:

- Title: Pay with X Money  
- Exact amount  
- XM reference  
- Merchant X handle  
- Copy reference / copy full message  

## Targets

- `purchase.thank-you.block.render`
- `customer-account.order-status.block.render`

## Data flow

1. Merchant saves X handle in app Settings → shop metafields `$app:x_money/handle` + `app_url`
2. `orders/create` webhook creates XM reference in app DB + order note/tag/metafield
3. Extension calls `GET /api/x-money/instructions` with a session token (polls briefly on Thank you for webhook race)

## Privacy

No customer PII in the API response or UI. Amount, reference, handle only.

## Dev

```bash
# from app root
npm run dev
```

Place the block in the checkout editor on Thank you / Order status.
