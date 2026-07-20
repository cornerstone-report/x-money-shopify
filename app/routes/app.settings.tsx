import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { setShopXMoneyConfig } from "../utils/metafields.server";
import { getOrCreateShopSettings } from "../utils/shop-data.server";
import { isValidXHandle, normalizeXHandle } from "../utils/x-handle";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);

  // Keep shop metafields in sync so the Thank you extension can resolve app URL + handle.
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (appUrl) {
    await setShopXMoneyConfig(admin, {
      xHandle: settings.xHandle,
      appUrl,
    });
  }

  return json({
    xHandle: settings.xHandle,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const raw = String(form.get("xHandle") ?? "");
  const xHandle = normalizeXHandle(raw);

  if (!isValidXHandle(xHandle)) {
    return json(
      {
        ok: false as const,
        error:
          "Handle must be 1–15 characters: letters, numbers, underscore only.",
        xHandle,
      },
      { status: 400 },
    );
  }

  await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, xHandle },
    update: { xHandle },
  });

  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (appUrl) {
    await setShopXMoneyConfig(admin, { xHandle, appUrl });
  }

  return json({ ok: true as const, xHandle });
};

export default function SettingsPage() {
  const { xHandle: savedHandle } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const [xHandle, setXHandle] = useState(savedHandle);

  useEffect(() => {
    if (actionData && "xHandle" in actionData && actionData.ok) {
      setXHandle(actionData.xHandle);
      return;
    }
    setXHandle(savedHandle);
  }, [savedHandle, actionData]);

  const onChange = useCallback((value: string) => {
    setXHandle(normalizeXHandle(value));
  }, []);

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && actionData.ok && (
              <Banner tone="success" title="Saved">
                <p>
                  {actionData.xHandle
                    ? `Buyers will be directed to @${actionData.xHandle}.`
                    : "X handle cleared."}
                </p>
              </Banner>
            )}
            {actionData && !actionData.ok && (
              <Banner tone="critical" title="Could not save">
                <p>{actionData.error}</p>
              </Banner>
            )}

            <Card>
              <Form method="post">
                <FormLayout>
                  <Text as="h2" variant="headingMd">
                    Your X handle
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    The public @handle where you receive X Money. This is the
                    only merchant setting stored. No third-party analytics, no
                    telemetry.
                  </Text>
                  <TextField
                    label="X handle"
                    name="xHandle"
                    value={xHandle}
                    onChange={onChange}
                    autoComplete="off"
                    prefix="@"
                    helpText="Letters, numbers, underscore. Max 15 characters."
                    maxLength={15}
                  />
                  <Button submit variant="primary" loading={busy}>
                    Save
                  </Button>
                </FormLayout>
              </Form>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Shopify payment method
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Create a manual payment method named exactly{" "}
                  <strong>X Money</strong> in Shopify Admin → Settings →
                  Payments. Checkout instructions can tell buyers to pay{" "}
                  {xHandle ? (
                    <>
                      <strong>@{xHandle}</strong>
                    </>
                  ) : (
                    "your X handle"
                  )}{" "}
                  and include the order reference from this app.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  This app does not talk to X. There is no public X merchant
                  API yet. You verify payment in X and click Mark paid here.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Saving also publishes your handle to the Thank you / Order
                  status extension so buyers see clear pay instructions after
                  checkout. Place the &quot;X Money payment instructions&quot;
                  block in the checkout editor.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
