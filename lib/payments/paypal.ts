import "server-only";
import { fromMinor, toMinor } from "@/lib/money";

// PayPal REST client for the sandbox money flow verified by scripts/paypal_sandbox_check.py:
//   Orders AUTHORIZE -> authorize -> partial captures -> void remainder -> Payouts.
// Every mutating call takes an idempotency key sent as PayPal-Request-Id.
// This module only talks to PayPal; recording results and enforcing state
// transitions is the caller's job (see spec Section 10).

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issue?: string,
    readonly debugId?: string | null,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function baseUrl(): string {
  const env = process.env.PAYPAL_ENVIRONMENT ?? "sandbox";
  if (env !== "sandbox") {
    throw new Error("Only PAYPAL_ENVIRONMENT=sandbox is supported in this build");
  }
  return SANDBOX_BASE;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials are not configured");

  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    throw new PayPalError(body.error_description ?? "OAuth failed", res.status, body.error);
  }
  // Refresh a minute early.
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; requestId?: string } = {},
): Promise<{ data: T; debugId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    Accept: "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const debugId = res.headers.get("paypal-debug-id");
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = data.details?.[0]?.issue as string | undefined;
    throw new PayPalError(data.message ?? `PayPal ${method} ${path} failed`, res.status, issue ?? data.name, debugId);
  }
  return { data: data as T, debugId };
}

// ---------- Orders: hold funds when the requester approves the plan ----------

export async function createAuthorizeOrder(input: {
  amountMinor: number;
  currency: string;
  referenceId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}) {
  type Order = { id: string; status: string; links: { rel: string; href: string }[] };
  const { data, debugId } = await call<Order>("POST", "/v2/checkout/orders", {
    requestId: input.idempotencyKey,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: fromMinor(input.amountMinor) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "SIDEQUEST",
            user_action: "CONTINUE",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = data.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null;
  return { orderId: data.id, status: data.status, approveUrl, debugId };
}

export async function getOrderStatus(orderId: string) {
  const { data } = await call<{ id: string; status: string }>("GET", `/v2/checkout/orders/${orderId}`);
  return data.status;
}

export async function authorizeOrder(orderId: string, idempotencyKey: string) {
  type Authorized = {
    purchase_units: { payments: { authorizations: { id: string; status: string; amount: { value: string } }[] } }[];
  };
  const { data, debugId } = await call<Authorized>("POST", `/v2/checkout/orders/${orderId}/authorize`, {
    requestId: idempotencyKey,
    body: {},
  });
  const auth = data.purchase_units[0].payments.authorizations[0];
  return { authorizationId: auth.id, status: auth.status, amountMinor: toMinor(auth.amount.value), debugId };
}

// ---------- Captures: one partial capture per approved mission ----------

export async function captureAuthorization(input: {
  authorizationId: string;
  amountMinor: number;
  currency: string;
  finalCapture: boolean;
  idempotencyKey: string;
}) {
  const { data, debugId } = await call<{ id: string; status: string }>(
    "POST",
    `/v2/payments/authorizations/${input.authorizationId}/capture`,
    {
      requestId: input.idempotencyKey,
      body: {
        amount: { currency_code: input.currency, value: fromMinor(input.amountMinor) },
        final_capture: input.finalCapture,
      },
    },
  );
  return { captureId: data.id, status: data.status, debugId };
}

export async function voidAuthorization(authorizationId: string, idempotencyKey: string) {
  const { debugId } = await call<unknown>("POST", `/v2/payments/authorizations/${authorizationId}/void`, {
    requestId: idempotencyKey,
  });
  return { debugId };
}

export async function getAuthorizationStatus(authorizationId: string) {
  const { data } = await call<{ status: string }>("GET", `/v2/payments/authorizations/${authorizationId}`);
  return data.status;
}

// ---------- Payouts: pay operators once their mission is captured ----------

export type PayoutItemInput = {
  receiverEmail: string;
  amountMinor: number;
  currency: string;
  senderItemId: string;
  note: string;
};

export async function createPayoutBatch(senderBatchId: string, items: PayoutItemInput[]) {
  type Created = { batch_header: { payout_batch_id: string; batch_status: string } };
  const { data, debugId } = await call<Created>("POST", "/v1/payments/payouts", {
    requestId: senderBatchId,
    body: {
      sender_batch_header: { sender_batch_id: senderBatchId, email_subject: "You were paid for a SIDEQUEST mission" },
      items: items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.receiverEmail,
        sender_item_id: item.senderItemId,
        note: item.note,
        amount: { currency: item.currency, value: fromMinor(item.amountMinor) },
      })),
    },
  });
  return { payoutBatchId: data.batch_header.payout_batch_id, batchStatus: data.batch_header.batch_status, debugId };
}

export async function getPayoutBatch(payoutBatchId: string) {
  type Batch = {
    batch_header: { batch_status: string };
    items?: { payout_item_id: string; transaction_status: string; payout_item: { sender_item_id: string } }[];
  };
  const { data } = await call<Batch>("GET", `/v1/payments/payouts/${payoutBatchId}`);
  return {
    batchStatus: data.batch_header.batch_status,
    items: (data.items ?? []).map((i) => ({
      payoutItemId: i.payout_item_id,
      senderItemId: i.payout_item.sender_item_id,
      transactionStatus: i.transaction_status,
    })),
  };
}
