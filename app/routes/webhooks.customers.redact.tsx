import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

/**
 * GDPR / privacy compliance: customers/redact.
 *
 * No customer PII is stored, so there is nothing to delete for a customer id.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  return new Response();
};
