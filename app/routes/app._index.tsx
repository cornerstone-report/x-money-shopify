import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings } from "../utils/shop-data.server";
import {
  appendMarkedPaidNote,
  markShopifyOrderPaid,
} from "../utils/shopify-order.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, pending] = await Promise.all([
    getOrCreateShopSettings(shop),
    prisma.pendingXMoneyPayment.findMany({
      where: { shop, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return json({
    xHandle: settings.xHandle,
    pending: pending.map((row) => ({
      id: row.id,
      orderName: row.orderName,
      xmReference: row.xmReference,
      amount: row.amount,
      currency: row.currency,
      shopifyOrderId: row.shopifyOrderId,
      createdAt: row.createdAt.toISOString(),
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent !== "mark_paid") {
    return json({ ok: false as const, error: "Unknown action" }, { status: 400 });
  }

  const paymentId = String(form.get("paymentId") || "");
  if (!paymentId) {
    return json({ ok: false as const, error: "Missing payment id" }, { status: 400 });
  }

  const payment = await prisma.pendingXMoneyPayment.findFirst({
    where: { id: paymentId, shop, status: "pending" },
  });

  if (!payment) {
    return json(
      { ok: false as const, error: "Payment not found or already marked paid" },
      { status: 404 },
    );
  }

  // Local first — this app's source of truth for reconciliation.
  await prisma.pendingXMoneyPayment.update({
    where: { id: payment.id },
    data: {
      status: "paid",
      paidAt: new Date(),
    },
  });

  // Best-effort Shopify side effects (must not undo local paid status).
  const shopifyMarked = await markShopifyOrderPaid(
    admin,
    payment.shopifyOrderId,
  );
  await appendMarkedPaidNote(admin, payment.shopifyOrderId);

  return json({
    ok: true as const,
    xmReference: payment.xmReference,
    shopifyMarked,
  });
};

function formatMoney(amount: string, currency: string): string {
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

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function PendingPaymentsPage() {
  const { xHandle, pending } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const rows = pending.map((row) => [
    row.orderName,
    <Text as="span" variant="bodyMd" fontWeight="semibold" key={`${row.id}-ref`}>
      {row.xmReference}
    </Text>,
    formatMoney(row.amount, row.currency),
    formatWhen(row.createdAt),
    <Form method="post" key={`${row.id}-form`}>
      <input type="hidden" name="intent" value="mark_paid" />
      <input type="hidden" name="paymentId" value={row.id} />
      <Button submit size="slim" variant="primary" loading={busy}>
        Mark paid
      </Button>
    </Form>,
  ]);

  return (
    <Page title="Pending X Money payments">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && "ok" in actionData && actionData.ok && (
              <Banner tone="success" title="Marked paid">
                <p>
                  {actionData.xmReference} recorded as paid
                  {actionData.shopifyMarked
                    ? " and the Shopify order was marked paid."
                    : ". If the Shopify order is still pending, mark it paid in Orders."}
                </p>
              </Banner>
            )}
            {actionData && "ok" in actionData && !actionData.ok && (
              <Banner tone="critical" title="Could not mark paid">
                <p>{actionData.error}</p>
              </Banner>
            )}

            {!xHandle && (
              <Banner tone="warning" title="Set your X handle">
                <p>
                  Add the X handle buyers should pay in Settings. There is no
                  public X merchant API yet — you reconcile payments yourself
                  using the XM reference.
                </p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Awaiting payment
                  </Text>
                  <Badge tone={pending.length ? "attention" : "success"}>
                    {pending.length === 0
                      ? "None pending"
                      : `${pending.length} pending`}
                  </Badge>
                </InlineStack>

                {pending.length === 0 ? (
                  <EmptyState
                    heading="No pending X Money orders"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      When a customer checks out with your manual &quot;X
                      Money&quot; payment method, a clean XM-XXXXX reference
                      appears here.
                    </p>
                  </EmptyState>
                ) : (
                  <Box paddingBlockStart="200">
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Order",
                        "XM reference",
                        "Amount",
                        "Created",
                        "",
                      ]}
                      rows={rows}
                    />
                  </Box>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  How this works
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  X does not offer a public merchant API yet. This app watches
                  Shopify for orders paid via a manual method named{" "}
                  <strong>X Money</strong>, issues an XM reference, and lets you
                  mark payment received. Customer contact data is not stored.
                </Text>
                {xHandle ? (
                  <Text as="p" variant="bodyMd">
                    Buyers should send X Money to{" "}
                    <Text as="span" fontWeight="semibold">
                      @{xHandle}
                    </Text>{" "}
                    with the XM reference in the note.
                  </Text>
                ) : null}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
