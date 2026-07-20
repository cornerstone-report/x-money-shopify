import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { PaymentBlock } from "./PaymentBlock.jsx";

export default function () {
  render(<ThankYouInstructions />, document.body);
}

function ThankYouInstructions() {
  const orderId = shopify.orderConfirmation?.value?.order?.id ?? null;

  return <PaymentBlock orderId={orderId} source="thank-you" />;
}
