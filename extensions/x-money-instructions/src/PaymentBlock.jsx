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
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [loading, setLoading] = useState(Boolean(orderId));
  const [copied, setCopied] = useState(/** @type {null | "ref" | "msg"} */ (null));
  const [shopConfig, setShopConfig] = useState(() => readShopConfig());

  // Metafields / settings can populate after first paint — resubscribe.
  useEffect(() => {
    setShopConfig(readShopConfig());

    const signal = shopify.appMetafields;
    if (signal?.subscribe) {
      return signal.subscribe(() => {
        setShopConfig(readShopConfig());
      });
    }
    return undefined;
  }, []);

  const appUrl = shopConfig.appUrl;

  const fetchInstructions = useCallback(async () => {
    if (!orderId) {
      setPayload({ show: false });
      setLoading(false);
      return { show: false, pending: false };
    }

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

      // Network access denied often surfaces as failed fetch (caught below)
      // or opaque errors — treat 0/network as network_blocked when applicable.
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
      const msg = err instanceof Error ? err.message : "Failed to load";
      // Failed fetch with network_access often = capability not granted.
      setError(
        msg === "Failed to fetch" || msg.includes("NetworkError")
          ? "network_blocked"
          : msg,
      );
      setLoading(false);
      return null;
    }
  }, [orderId, source, appUrl]);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;

    async function run() {
      const data = await fetchInstructions();
      if (cancelled) return;

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

    // Wait until appUrl is known before treating as hard failure.
    if (!appUrl) {
      setError("missing_app_url");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchInstructions, orderId, appUrl]);

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

  // Config / network problems — show a short merchant-visible hint on Thank you
  // so blank UI is debuggable (still no customer PII).
  if (error === "missing_app_url" || error === "network_blocked" || error === "unauthorized") {
    return (
      <s-box padding="base" border="base" borderRadius="base">
        <s-stack gap="small">
          <s-heading>Pay with X Money</s-heading>
          {error === "missing_app_url" ? (
            <s-text>
              Payment instructions are not linked yet. Open the X Money app →
              Settings, save your handle, then refresh this page.
            </s-text>
          ) : null}
          {error === "network_blocked" ? (
            <s-text>
              Could not reach the X Money app (network access may be blocked).
              In Partners → Apps → x-money → API access, allow network access for
              checkout UI extensions.
            </s-text>
          ) : null}
          {error === "unauthorized" ? (
            <s-text>
              Could not authorize with the X Money app. Restart shopify app dev
              and try again.
            </s-text>
          ) : null}
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
      </s-stack>
    </s-box>
  );
}

/**
 * Resolve app URL + handle from shop metafields and optional extension settings.
 */
function readShopConfig() {
  let xHandle = "";
  let appUrl = "";

  const entries =
    (typeof shopify !== "undefined" &&
      (shopify.appMetafields?.value || shopify.appMetafields?.current)) ||
    [];

  for (const entry of entries) {
    const type = entry?.target?.type;
    // Prefer shop entries; if type is missing, still accept known keys.
    if (type && type !== "shop") continue;
    const key = entry?.metafield?.key;
    const value = entry?.metafield?.value;
    if (!key || value == null || value === "") continue;
    if (key === "handle") xHandle = String(value).replace(/^@+/, "");
    if (key === "app_url") appUrl = String(value).replace(/\/$/, "");
  }

  // Optional merchant setting from checkout editor (fallback).
  const settingsUrl =
    typeof shopify !== "undefined" &&
    (shopify.settings?.value?.app_url || shopify.settings?.current?.app_url);
  if (!appUrl && settingsUrl) {
    appUrl = String(settingsUrl).replace(/\/$/, "");
  }

  return { xHandle, appUrl };
}
