import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../utils/shop-data.server";

/**
 * GDPR / privacy compliance: shop/redact.
 * Hard-delete all app data for the shop (Shopify may fire ~48h after uninstall):
 * PendingXMoneyPayment, ShopSettings, Session.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  if (shop) {
    await deleteAllShopData(shop);
  }

  return new Response();
};
