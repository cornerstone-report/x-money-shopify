import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  DataTable,
  EmptyState,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const orders = await prisma.pendingXMoneyPayment.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return json({
    orders: orders.map((row) => ({
      id: row.id,
      orderName: row.orderName,
      xmReference: row.xmReference,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
    })),
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

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function OrdersHistoryPage() {
  const { orders } = useLoaderData<typeof loader>();

  const rows = orders.map((row) => [
    row.orderName,
    row.xmReference,
    formatMoney(row.amount, row.currency),
    row.status === "paid" ? (
      <Badge tone="success" key={`${row.id}-status`}>
        Paid
      </Badge>
    ) : (
      <Badge tone="attention" key={`${row.id}-status`}>
        Pending
      </Badge>
    ),
    formatWhen(row.createdAt),
    formatWhen(row.paidAt),
  ]);

  return (
    <Page title="Orders history">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                X Money orders
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Local history only — order id, name, amount, XM reference, and
                status. No customer names, emails, or addresses are stored.
              </Text>

              {orders.length === 0 ? (
                <EmptyState
                  heading="No X Money orders yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Orders that check out with the &quot;X Money&quot; payment
                    method will appear here after the webhook fires.
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
                      "text",
                    ]}
                    headings={[
                      "Order",
                      "XM reference",
                      "Amount",
                      "Status",
                      "Created",
                      "Paid at",
                    ]}
                    rows={rows}
                  />
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
