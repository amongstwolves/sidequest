import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { TransitionError } from "@/lib/objectives";
import { PayPalError } from "@/lib/payments/paypal";
import { completeFunding } from "@/lib/payments/flow";

// PayPal redirects the buyer here after approving the hold (?objective=…&token=<order id>).
export async function GET(request: NextRequest) {
  const objectiveId = request.nextUrl.searchParams.get("objective") ?? "";
  const orderId = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(objectiveId) || !/^[A-Z0-9]{10,30}$/.test(orderId)) {
    return new Response("Invalid PayPal return", { status: 400 });
  }
  let status = "authorized";
  try {
    await completeFunding(objectiveId, orderId);
  } catch (err) {
    if (!(err instanceof TransitionError || err instanceof PayPalError)) throw err;
    console.error("PayPal funding failed", err);
    status = "error";
  }
  redirect(`/objectives/${objectiveId}?funding=${status}`);
}
