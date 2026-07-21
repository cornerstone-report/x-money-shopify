import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
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

function currentAppUrl(): string {
  return (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);
  const appUrl = currentAppUrl();

  // Always rewrite live app_url + handle for the Thank you / Order status extension.
  if (appUrl) {
    await setShopXMoneyConfig(admin, {
      xHandle: settings.xHandle,
      appUrl,
    });
  }

  return json({
    xHandle: settings.xHandle,
    appUrl,
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

  const appUrl = currentAppUrl();
  if (!appUrl) {
    return json({
      ok: true as const,
      xHandle,
      appUrl: "",
      metafieldWarning:
        "Handle saved, but SHOPIFY_APP_URL is empty. Restart shopify app dev so the Thank you block can reach this app.",
    });
  }

  const result = await setShopXMoneyConfig(admin, { xHandle, appUrl });
  if (!result.ok) {
    return json({
      ok: true as const,
      xHandle,
      appUrl,
      metafieldWarning:
        "Handle saved, but shop metafields failed to update. Check the server log for [x-money] metafieldsSet errors.",
    });
  }

  return json({ ok: true as const, xHandle, appUrl });
};

export default function SettingsPage() {
  const { xHandle: savedHandle, appUrl } = useLoaderData<typeof loader>();
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

  const savedOk = actionData?.ok === true;
  const saveFailed = actionData?.ok === false;
  const metafieldWarning =
    savedOk && "metafieldWarning" in actionData && actionData.metafieldWarning
      ? String(actionData.metafieldWarning)
      : "";
  const savedHandleValue =
    savedOk && actionData.xHandle ? String(actionData.xHandle) : "";
  const savedAppUrl =
    savedOk && "appUrl" in actionData && actionData.appUrl
      ? String(actionData.appUrl)
      : "";
  const saveError =
    saveFailed && "error" in actionData ? String(actionData.error) : "";

  const displayAppUrl = savedAppUrl || appUrl || "";

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {savedOk && !metafieldWarning && (
              <Banner tone="success" title="Saved">
                <p>
                  {savedHandleValue
                    ? `X handle set to @${savedHandleValue}. `
                    : "X handle cleared. "}
                  {savedAppUrl
                    ? "Shop metafields updated for the Thank you extension."
                    : ""}
                </p>
              </Banner>
            )}
            {savedOk && metafieldWarning ? (
              <Banner tone="warning" title="Saved with a warning">
                <p>{metafieldWarning}</p>
              </Banner>
            ) : null}
            {saveFailed ? (
              <Banner tone="critical" title="Could not save">
                <p>{saveError}</p>
              </Banner>
            ) : null}
            {!appUrl && (
              <Banner tone="warning" title="App URL not set">
                <p>
                  Restart <code>shopify app dev</code> so{" "}
                  <code>SHOPIFY_APP_URL</code> is set. The Thank you extension
                  needs it to load payment instructions.
                </p>
              </Banner>
            )}

            <Card>
              <Form method="post">
                <FormLayout>
                  <Text as="h2" variant="headingMd">
                    Your X handle
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Public @handle where you receive X Money. Saving rewrites
                    shop metafields used by the Thank you / Order status block
                    (handle + live app URL).
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
                  <BlockStack gap="100">
                    <InlineStack gap="200" wrap>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        Current handle:
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {savedHandle ? `@${savedHandle}` : "(not set)"}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200" wrap>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        App URL:
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {displayAppUrl || "(not set — restart shopify app dev)"}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <Button submit variant="primary" loading={busy}>
                    Save
                  </Button>
                </FormLayout>
              </Form>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Manual payment method
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  In Shopify Admin → Settings → Payments, add a manual method
                  named exactly <strong>X Money</strong>.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Keep checkout payment instructions short — for example:{" "}
                  <em>
                    “You’ll get the exact amount and XM reference on the Thank
                    you page.”
                  </em>{" "}
                  The live extension shows amount, reference, and{" "}
                  {xHandle || savedHandle ? (
                    <strong>@{xHandle || savedHandle}</strong>
                  ) : (
                    "your handle"
                  )}
                  .
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  In the checkout editor, add the{" "}
                  <strong>X Money payment instructions</strong> block to Thank
                  you and Order status. There is no public X merchant API yet —
                  you confirm funds in X, then Mark paid here.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
