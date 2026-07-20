import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Checkout / Customer Account UI extension endpoint.
 *
 * Auth: session token (Bearer) via authenticate.public.checkout or
 * authenticate.public.customerAccount.
 *
 * Returns only non-PII payment instructions for X Money orders:
 * xmReference, amount, currency, xHandle.
 *
 * CORS: Access-Control-Allow-Origin: * (required for checkout UI extensions).
 */

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

function shopFromDest(dest: string | undefined): string | null {
  if (!dest) return null;
  try {
    if (dest.includes("://")) {
      return new URL(dest).host;
    }
    return dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
  } catch {
    return dest.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  }
}

function numericOrderId(raw: string | null): string | null {
  if (!raw) return null;
  const gidMatch = raw.match(/Order\/(\d+)/);
  if (gidMatch?.[1]) return gidMatch[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

function formatAmount(amount: string, currency: string): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(numeric);
    } catch {
      // fall through
    }
  }
  return `${amount} ${currency}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  let shop: string | null = null;
  let cors: ((response: Response) => Response) | null = null;

  // Session tokens from Thank you (checkout) vs Order status (customer account).
  // Auth helpers may throw a Response on failure — try both surfaces.
  const authAttempts = [
    () => authenticate.public.checkout(request),
    () => authenticate.public.customerAccount(request),
  ] as const;

  for (const attempt of authAttempts) {
    try {
      const result = await attempt();
      cors = result.cors;
      shop = shopFromDest(result.sessionToken.dest);
      break;
    } catch (error: unknown) {
      if (error instanceof Response) {
        continue;
      }
      // Unexpected non-Response errors — try next surface, then fail closed.
      continue;
    }
  }

  if (!shop || !cors) {
    return json(
      { show: false, error: "unauthorized" },
      { status: 401, headers: corsHeaders() },
    );
  }

  const respond = (body: unknown, init?: ResponseInit) => {
    const response = json(body, {
      ...init,
      headers: {
        ...corsHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    return cors ? cors(response) : response;
  };

  if (!shop) {
    return respond({ show: false, error: "missing_shop" }, { status: 400 });
  }

  const url = new URL(request.url);
  const orderId = numericOrderId(url.searchParams.get("orderId"));

  if (!orderId) {
    return respond({ show: false, error: "missing_order" }, { status: 400 });
  }

  const [payment, settings] = await Promise.all([
    prisma.pendingXMoneyPayment.findUnique({
      where: {
        shop_shopifyOrderId: { shop, shopifyOrderId: orderId },
      },
    }),
    prisma.shopSettings.findUnique({ where: { shop } }),
  ]);

  // Not found yet — webhook may still be processing (Thank you race).
  if (!payment) {
    return respond({
      show: false,
      pending: true,
    });
  }

  // Only show while awaiting X Money; hide after Mark paid (optional UX).
  // Order status can still show if pending; once paid, hide instructions.
  if (payment.status !== "pending") {
    return respond({
      show: false,
      pending: false,
      paid: true,
    });
  }

  return respond({
    show: true,
    pending: false,
    xmReference: payment.xmReference,
    amount: payment.amount,
    currency: payment.currency,
    amountLabel: formatAmount(payment.amount, payment.currency),
    xHandle: settings?.xHandle ?? "",
    orderName: payment.orderName,
  });
};
