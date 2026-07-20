import type { ActionFunctionArgs } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  isXMoneyOrder,
  shopifyOrderIdFromPayload,
  type OrderWebhookPayload,
} from "../utils/x-money.server";
import { allocateUniqueXmReference } from "../utils/xm-reference.server";
import { annotateOrderWithXmReference } from "../utils/shopify-order.server";

interface OrdersCreatePayload extends OrderWebhookPayload {
  note?: string | null;
  tags?: string | string[] | null;
}

/**
 * orders/create webhook.
 * If the order used the "X Money" manual payment method:
 * 1. Create a pending reconciliation row with XM-XXXXX
 * 2. Best-effort: tag order `x-money` + append XM reference to order note
 *
 * Privacy: app DB stores only shop, order id/name, amount, currency, XM ref, status.
 * Tags/notes live in Shopify Admin (merchant-owned), not as extra PII in our DB.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE" && topic !== "orders/create") {
    return new Response();
  }

  const order = payload as OrdersCreatePayload;

  if (!isXMoneyOrder(order)) {
    return new Response();
  }

  const shopifyOrderId = shopifyOrderIdFromPayload(order);
  if (!shopifyOrderId) {
    return new Response();
  }

  const existing = await prisma.pendingXMoneyPayment.findUnique({
    where: {
      shop_shopifyOrderId: { shop, shopifyOrderId },
    },
    select: { id: true, xmReference: true },
  });

  // Idempotent: webhooks can retry. Still try annotate if record already exists
  // (covers prior create that failed on Admin API).
  let xmReference = existing?.xmReference;

  if (!existing) {
    xmReference = await allocateUniqueXmReference(shop);
    const orderName = order.name?.trim() || `#${shopifyOrderId}`;
    const amount = order.total_price?.trim() || "0.00";
    const currency =
      order.presentment_currency?.trim() ||
      order.currency?.trim() ||
      "USD";

    await prisma.pendingXMoneyPayment.create({
      data: {
        shop,
        shopifyOrderId,
        orderName,
        xmReference,
        amount,
        currency,
        status: "pending",
      },
    });
  }

  if (admin && xmReference) {
    await annotateOrderWithXmReference(admin, {
      shopifyOrderId,
      xmReference,
      existingNote: order.note,
      existingTags: order.tags,
    });
  }

  return new Response();
};
