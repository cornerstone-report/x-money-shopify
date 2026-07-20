/**
 * App-owned metafields for the Checkout UI extension.
 * Namespace $app:x_money — exclusive to this app. No customer PII.
 */

import type { AdminGraphql } from "./shopify-order.server";

export const X_MONEY_METAFIELD_NAMESPACE = "$app:x_money";
export const X_MONEY_HANDLE_KEY = "handle";
export const X_MONEY_APP_URL_KEY = "app_url";
export const X_MONEY_REFERENCE_KEY = "reference";

function logSoftFail(context: string, detail: unknown): void {
  const message =
    detail instanceof Error
      ? detail.message
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
  // eslint-disable-next-line no-console -- intentional soft-fail ops log
  console.error(`[x-money] ${context}: ${message}`);
}

/**
 * Persist merchant X handle + app URL on the shop for the extension.
 * Soft-fail: never throws.
 */
export async function setShopXMoneyConfig(
  admin: AdminGraphql,
  params: { shopGid?: string; xHandle: string; appUrl: string },
): Promise<void> {
  try {
    let shopId = params.shopGid;
    if (!shopId) {
      const shopResponse = await admin.graphql(
        `#graphql
        query ShopId {
          shop {
            id
          }
        }`,
      );
      const shopBody = (await shopResponse.json()) as {
        data?: { shop?: { id?: string } };
      };
      shopId = shopBody?.data?.shop?.id;
    }
    if (!shopId) {
      logSoftFail("setShopXMoneyConfig", "missing shop id");
      return;
    }

    const metafields = [
      {
        ownerId: shopId,
        namespace: X_MONEY_METAFIELD_NAMESPACE,
        key: X_MONEY_HANDLE_KEY,
        type: "single_line_text_field",
        value: params.xHandle || "",
      },
      {
        ownerId: shopId,
        namespace: X_MONEY_METAFIELD_NAMESPACE,
        key: X_MONEY_APP_URL_KEY,
        type: "single_line_text_field",
        value: params.appUrl.replace(/\/$/, ""),
      },
    ];

    const response = await admin.graphql(
      `#graphql
      mutation SetShopXMoneyConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { metafields } },
    );
    const body = (await response.json()) as {
      data?: {
        metafieldsSet?: { userErrors?: Array<{ message?: string }> };
      };
    };
    const errors = body?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      logSoftFail(
        "metafieldsSet shop config",
        errors.map((e) => e.message).join("; "),
      );
    }
  } catch (error: unknown) {
    logSoftFail("setShopXMoneyConfig threw", error);
  }
}

/**
 * Write XM reference onto the order so Order status can read it via metafields.
 * Soft-fail: never throws.
 */
export async function setOrderXmReferenceMetafield(
  admin: AdminGraphql,
  params: { shopifyOrderId: string; xmReference: string },
): Promise<void> {
  const ownerId = `gid://shopify/Order/${params.shopifyOrderId}`;
  try {
    const response = await admin.graphql(
      `#graphql
      mutation SetOrderXmReference($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId,
              namespace: X_MONEY_METAFIELD_NAMESPACE,
              key: X_MONEY_REFERENCE_KEY,
              type: "single_line_text_field",
              value: params.xmReference,
            },
          ],
        },
      },
    );
    const body = (await response.json()) as {
      data?: {
        metafieldsSet?: { userErrors?: Array<{ message?: string }> };
      };
    };
    const errors = body?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      logSoftFail(
        "metafieldsSet order reference",
        errors.map((e) => e.message).join("; "),
      );
    }
  } catch (error: unknown) {
    logSoftFail("setOrderXmReferenceMetafield threw", error);
  }
}
