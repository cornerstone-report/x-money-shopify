import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { PaymentBlock } from "./PaymentBlock.jsx";

export default function () {
  render(<OrderStatusInstructions />, document.body);
}

function OrderStatusInstructions() {
  // Customer Account Order API: shopify.order.id (GID)
  const orderId = shopify.order?.value?.id ?? shopify.order?.id ?? null;

  return <PaymentBlock orderId={orderId} source="order-status" />;
}
