import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../utils/shop-data.server";

/**
 * app/uninstalled — hard-delete all local data for the shop:
 * PendingXMoneyPayment, ShopSettings, Session.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  // Always wipe by shop domain, even if session was already removed.
  if (shop) {
    await deleteAllShopData(shop);
  }

  return new Response();
};
