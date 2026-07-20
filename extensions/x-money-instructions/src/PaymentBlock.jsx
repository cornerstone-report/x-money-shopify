import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

/**
 * Shared X Money payment instructions block for Thank you + Order status.
 *
 * Privacy: only displays amount, XM reference, and merchant X handle.
 * No customer PII is fetched or rendered.
 */

const POLL_MS = 1200;
const MAX_POLLS = 12;

/**
 * @param {{
 *   orderId: string | null | undefined,
 *   source: "thank-you" | "order-status",
 * }} props
 */
export function PaymentBlock({ orderId, source }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [copied, setCopied] = useState(/** @type {null | "ref" | "msg"} */ (null));

  const shopConfig = useMemo(() => readShopConfigFromMetafields(), []);

  const fetchInstructions = useCallback(async () => {
    if (!orderId) {
      setPayload({ show: false });
      setLoading(false);
      return { show: false, pending: false };
    }

    const appUrl = shopConfig.appUrl;
    if (!appUrl) {
      setError("missing_app_url");
      setLoading(false);
      return null;
    }

    try {
      const token = await shopify.sessionToken.get();
      const endpoint = new URL("/api/x-money/instructions", appUrl);
      endpoint.searchParams.set("orderId", orderId);
      endpoint.searchParams.set("source", source);

      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        setError("unauthorized");
        setLoading(false);
        return null;
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setPayload(data);
      setError(null);

      if (!data.pending) {
        setLoading(false);
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
      return null;
    }
  }, [orderId, source, shopConfig.appUrl]);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;

    async function run() {
      const data = await fetchInstructions();
      if (cancelled) return;

      // Webhook may lag Thank you page — poll briefly for the pending row.
      if (data?.pending && polls < MAX_POLLS) {
        polls += 1;
        timer = setTimeout(run, POLL_MS);
        return;
      }

      setLoading(false);
      if (data?.pending && !data?.show) {
        setPayload({ show: false });
      }
    }

    if (!orderId) {
      setLoading(false);
      setPayload({ show: false });
      return;
    }

    setLoading(true);
    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchInstructions, orderId]);

  const displayHandle = payload?.xHandle || shopConfig.xHandle || "";

  const message = useMemo(() => {
    if (!payload?.show) return "";
    const handle = displayHandle ? `@${displayHandle}` : "the merchant on X";
    return [
      "Pay with X Money",
      `Amount: ${payload.amountLabel}`,
      `Reference: ${payload.xmReference}`,
      `Send the exact amount to ${handle} via X Money and include this reference in the note: ${payload.xmReference}`,
    ].join("\n");
  }, [payload, displayHandle]);

  const writeClipboard = useCallback(async (text) => {
    if (shopify.clipboard?.write) {
      await shopify.clipboard.write(text);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  }, []);

  const onCopyReference = useCallback(async () => {
    if (!payload?.xmReference) return;
    try {
      await writeClipboard(payload.xmReference);
      setCopied("ref");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard may be denied.
    }
  }, [payload, writeClipboard]);

  const onCopyMessage = useCallback(async () => {
    if (!message) return;
    try {
      await writeClipboard(message);
      setCopied("msg");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }, [message, writeClipboard]);

  if (!orderId) {
    return null;
  }

  if (loading) {
    return (
      <s-box padding="base" border="base" borderRadius="base">
        <s-stack gap="small">
          <s-heading>Pay with X Money</s-heading>
          <s-text>Loading payment instructions…</s-text>
        </s-stack>
      </s-box>
    );
  }

  // Not an X Money order (or webhook never created a row) — render nothing.
  if (!payload?.show) {
    return null;
  }

  const handleLabel = displayHandle
    ? `@${displayHandle}`
    : "the merchant’s X handle";

  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack gap="base">
        <s-heading>Pay with X Money</s-heading>

        <s-text>
          Send the exact amount to{" "}
          <s-text type="strong">{handleLabel}</s-text> via X Money and include
          this reference in the note.
        </s-text>

        <s-stack gap="small">
          <s-text>
            <s-text type="strong">Amount: </s-text>
            {payload.amountLabel}
          </s-text>
          <s-text>
            <s-text type="strong">Reference: </s-text>
            {payload.xmReference}
          </s-text>
        </s-stack>

        <s-stack direction="inline" gap="small">
          <s-button variant="primary" onClick={onCopyReference}>
            {copied === "ref" ? "Copied" : "Copy reference"}
          </s-button>
          <s-button variant="secondary" onClick={onCopyMessage}>
            {copied === "msg" ? "Copied" : "Copy full message"}
          </s-button>
        </s-stack>

        {error === "missing_app_url" ? (
          <s-text tone="caution">
            Open the X Money app Settings once so payment instructions can load.
          </s-text>
        ) : null}
      </s-stack>
    </s-box>
  );
}

/**
 * Read shop-owned app metafields declared in shopify.extension.toml.
 * Written by the app when Settings are saved (handle + app_url).
 */
function readShopConfigFromMetafields() {
  const entries =
    (typeof shopify !== "undefined" &&
      (shopify.appMetafields?.value || shopify.appMetafields?.current)) ||
    [];

  let xHandle = "";
  let appUrl = "";

  for (const entry of entries) {
    if (entry?.target?.type && entry.target.type !== "shop") continue;
    const key = entry?.metafield?.key;
    const value = entry?.metafield?.value;
    if (!key || value == null) continue;
    if (key === "handle") xHandle = String(value).replace(/^@+/, "");
    if (key === "app_url") appUrl = String(value).replace(/\/$/, "");
  }

  return { xHandle, appUrl };
}
