import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

/**
 * GDPR / privacy compliance: customers/data_request.
 *
 * This app does not store customer PII (no name, email, phone, address).
 * There is nothing customer-specific to export beyond what Shopify already has.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  return new Response();
};
