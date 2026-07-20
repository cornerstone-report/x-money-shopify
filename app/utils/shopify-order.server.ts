/**
 * Best-effort Shopify Admin order annotations.
 * Failures are logged and swallowed — webhooks and Mark paid must not crash.
 */

export type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const XM_NOTE_PREFIX = "X Money reference:";
const MARKED_PAID_NOTE = "Marked paid via X Money app";
const X_MONEY_TAG = "x-money";

export function orderGid(shopifyOrderId: string): string {
  return `gid://shopify/Order/${shopifyOrderId}`;
}

/** Append a line to an order note if not already present. */
export function appendNoteLine(
  existing: string | null | undefined,
  line: string,
): string {
  const trimmedLine = line.trim();
  const base = (existing ?? "").trimEnd();
  if (!trimmedLine) return base;
  if (base.includes(trimmedLine)) return base;
  if (!base) return trimmedLine;
  return `${base}\n${trimmedLine}`;
}

/** Merge tags from webhook payload (string or array) with a required tag. */
export function mergeOrderTags(
  existing: string | string[] | null | undefined,
  tag: string,
): string[] {
  const fromPayload = Array.isArray(existing)
    ? existing
    : String(existing ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  const lower = new Set(fromPayload.map((t) => t.toLowerCase()));
  if (!lower.has(tag.toLowerCase())) {
    fromPayload.push(tag);
  }
  return fromPayload;
}

function logSoftFail(context: string, detail: unknown): void {
  // Operational soft-fail only — never throw from callers.
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
 * After local pending row is created: tag order `x-money` and append
 * `X Money reference: XM-XXXXX` to the note (preserve existing note).
 */
export async function annotateOrderWithXmReference(
  admin: AdminGraphql,
  params: {
    shopifyOrderId: string;
    xmReference: string;
    existingNote?: string | null;
    existingTags?: string | string[] | null;
  },
): Promise<void> {
  const id = orderGid(params.shopifyOrderId);
  const note = appendNoteLine(
    params.existingNote,
    `${XM_NOTE_PREFIX} ${params.xmReference}`,
  );
  const tags = mergeOrderTags(params.existingTags, X_MONEY_TAG);

  try {
    const response = await admin.graphql(
      `#graphql
      mutation AnnotateXMoneyOrder($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: { id, note, tags },
        },
      },
    );
    const body = (await response.json()) as {
      data?: {
        orderUpdate?: {
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const userErrors = body?.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length) {
      logSoftFail(
        "orderUpdate userErrors (XM annotate)",
        userErrors.map((e) => e.message).join("; "),
      );
    }
    if (body?.errors?.length) {
      logSoftFail(
        "orderUpdate GraphQL errors (XM annotate)",
        body.errors.map((e) => e.message).join("; "),
      );
    }
  } catch (error: unknown) {
    logSoftFail("orderUpdate threw (XM annotate)", error);
  }
}

/**
 * After Mark paid: best-effort append confirmation line to the order note.
 * Fetches current note first so we do not clobber staff notes.
 */
export async function appendMarkedPaidNote(
  admin: AdminGraphql,
  shopifyOrderId: string,
): Promise<void> {
  const id = orderGid(shopifyOrderId);

  try {
    const queryResponse = await admin.graphql(
      `#graphql
      query OrderNote($id: ID!) {
        order(id: $id) {
          id
          note
        }
      }`,
      { variables: { id } },
    );
    const queryBody = (await queryResponse.json()) as {
      data?: { order?: { note?: string | null } | null };
    };
    const existingNote = queryBody?.data?.order?.note ?? "";
    const note = appendNoteLine(existingNote, MARKED_PAID_NOTE);

    if (note === (existingNote ?? "").trimEnd()) {
      return;
    }

    const response = await admin.graphql(
      `#graphql
      mutation AppendMarkedPaidNote($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: { id, note },
        },
      },
    );
    const body = (await response.json()) as {
      data?: {
        orderUpdate?: {
          userErrors?: Array<{ message?: string }>;
        };
      };
    };
    const userErrors = body?.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length) {
      logSoftFail(
        "orderUpdate userErrors (marked paid note)",
        userErrors.map((e) => e.message).join("; "),
      );
    }
  } catch (error: unknown) {
    logSoftFail("appendMarkedPaidNote threw", error);
  }
}

/** Best-effort mark order paid in Shopify. Returns true if Admin reports success. */
export async function markShopifyOrderPaid(
  admin: AdminGraphql,
  shopifyOrderId: string,
): Promise<boolean> {
  const id = orderGid(shopifyOrderId);
  try {
    const response = await admin.graphql(
      `#graphql
      mutation MarkOrderPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order {
            id
            displayFinancialStatus
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: { id },
        },
      },
    );
    const body = (await response.json()) as {
      data?: {
        orderMarkAsPaid?: {
          order?: { id?: string } | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
    };
    const errors = body?.data?.orderMarkAsPaid?.userErrors ?? [];
    if (errors.length) {
      logSoftFail(
        "orderMarkAsPaid userErrors",
        errors.map((e) => e.message).join("; "),
      );
      return false;
    }
    return Boolean(body?.data?.orderMarkAsPaid?.order?.id);
  } catch (error: unknown) {
    logSoftFail("orderMarkAsPaid threw", error);
    return false;
  }
}
