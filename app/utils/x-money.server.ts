/**
 * Detect whether a Shopify order used the merchant's "X Money" payment method.
 *
 * Merchants create a manual payment method named "X Money" in Shopify Admin
 * (Settings → Payments → Manual payment methods). Shopify includes that name
 * on the order as gateway / payment_gateway_names.
 *
 * Honest constraint: X has no public merchant API yet. This app only tracks
 * orders that already came through Shopify with that payment method label.
 */

export interface OrderWebhookPayload {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  total_price?: string;
  currency?: string;
  presentment_currency?: string;
  gateway?: string | null;
  payment_gateway_names?: string[] | null;
  financial_status?: string | null;
}

const X_MONEY_PATTERN = /\bx[\s_-]*money\b/i;

export function normalizePaymentLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function isXMoneyPaymentLabel(label: string): boolean {
  const normalized = normalizePaymentLabel(label);
  if (!normalized) return false;
  if (normalized === "xmoney") return true;
  return X_MONEY_PATTERN.test(normalized);
}

/**
 * True if any gateway / payment method name on the order is "X Money".
 */
export function isXMoneyOrder(payload: OrderWebhookPayload): boolean {
  const labels: string[] = [];

  if (payload.gateway) {
    labels.push(payload.gateway);
  }
  if (Array.isArray(payload.payment_gateway_names)) {
    for (const name of payload.payment_gateway_names) {
      if (name) labels.push(name);
    }
  }

  return labels.some(isXMoneyPaymentLabel);
}

export function shopifyOrderIdFromPayload(
  payload: OrderWebhookPayload,
): string | null {
  if (payload.id != null) {
    return String(payload.id);
  }
  if (payload.admin_graphql_api_id) {
    const match = payload.admin_graphql_api_id.match(/Order\/(\d+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export { isValidXHandle, normalizeXHandle } from "./x-handle";
