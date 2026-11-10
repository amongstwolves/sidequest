#!/usr/bin/env python3
"""
SIDEQUEST — PayPal sandbox capability check (spec v1.1, Section 10.1a).

Proves, against the real PayPal sandbox, every money step the demo depends on:
  1. OAuth token + which scopes the REST app has (is Payouts enabled?)
  2. Payouts API: batch to two operator accounts, polled to a final status
  3. Orders AUTHORIZE: create order -> buyer approves -> authorize (funds held)
  4. Two partial captures (one per mission) from one authorization
  5. Idempotency: replaying a capture with the same PayPal-Request-Id returns the same capture
  6. Void of the remaining authorization (unused budget released)
  7. Payouts funded by those captures

Standard library only. Reads credentials from ../.env.local. Never prints secrets.

Usage:
  python3 scripts/paypal_sandbox_check.py token          # check credentials + scopes
  python3 scripts/paypal_sandbox_check.py payouts        # payout-only test (uses sandbox balance)
  python3 scripts/paypal_sandbox_check.py order-create   # create $75 AUTHORIZE order, prints approval link
  python3 scripts/paypal_sandbox_check.py order-finish   # after approving: authorize, capture x2, void, payout
"""

import base64
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
STATE_FILE = ROOT / "scripts" / ".sandbox-state.json"
RESULTS_FILE = ROOT / "scripts" / "sandbox-results.json"
BASE = "https://api-m.sandbox.paypal.com"

# Demo numbers from spec Section 20: two missions ($30, $35) under a $75 cap.
CURRENCY = "USD"
AUTH_TOTAL = "75.00"
MISSION_A = "30.00"
MISSION_B = "35.00"

results = []

# python.org builds on macOS ship without a CA bundle; fall back to the system one.
# Certificate verification stays on.
_SYSTEM_CA = "/etc/ssl/cert.pem"
SSL_CONTEXT = ssl.create_default_context(
    cafile=_SYSTEM_CA if os.path.exists(_SYSTEM_CA) else None
)


# ---------- plumbing ----------

def load_env():
    if not ENV_FILE.exists():
        sys.exit(f"Missing {ENV_FILE}. Copy .env.example to .env.local and fill in sandbox values.")
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    if env.get("PAYPAL_ENVIRONMENT", "sandbox") != "sandbox":
        sys.exit("Refusing to run: PAYPAL_ENVIRONMENT must be 'sandbox'.")
    for key in ("PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"):
        if not env.get(key):
            sys.exit(f"{key} is empty in .env.local")
    return env


def call(method, path, token=None, body=None, request_id=None, basic=None, form=None):
    url = path if path.startswith("http") else BASE + path
    headers = {"Accept": "application/json"}
    data = None
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(basic.encode()).decode()
    elif token:
        headers["Authorization"] = "Bearer " + token
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode()
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if request_id:
        headers["PayPal-Request-Id"] = request_id
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw), resp.headers.get("Paypal-Debug-Id")
    except urllib.error.HTTPError as err:
        raw = err.read().decode() or "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return err.code, payload, err.headers.get("Paypal-Debug-Id")


def record(step, ok, detail="", **ids):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {step}" + (f" — {detail}" if detail else ""))
    for k, v in ids.items():
        if v:
            print(f"        {k}: {v}")
    results.append({"step": step, "ok": ok, "detail": detail, **ids})
    return ok


def error_detail(status, payload):
    name = payload.get("name") or payload.get("error") or ""
    msg = payload.get("message") or payload.get("error_description") or ""
    issues = [d.get("issue") for d in payload.get("details", []) if d.get("issue")]
    return f"HTTP {status} {name} {msg} {' '.join(issues)}".strip()


def save_results(command):
    history = []
    if RESULTS_FILE.exists():
        try:
            history = json.loads(RESULTS_FILE.read_text())
        except json.JSONDecodeError:
            history = []
    history.append({
        "command": command,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "steps": results,
    })
    RESULTS_FILE.write_text(json.dumps(history, indent=2))
    passed = sum(r["ok"] for r in results)
    print(f"\n{passed}/{len(results)} steps passed. Log: {RESULTS_FILE.relative_to(ROOT)}")


# ---------- steps ----------

def get_token(env):
    status, payload, debug = call(
        "POST", "/v1/oauth2/token",
        basic=f"{env['PAYPAL_CLIENT_ID']}:{env['PAYPAL_CLIENT_SECRET']}",
        form={"grant_type": "client_credentials"},
    )
    if status != 200:
        record("OAuth token", False, error_detail(status, payload), debug_id=debug)
        save_results("token")
        sys.exit(1)
    scopes = payload.get("scope", "").split()
    record("OAuth token", True, f"app_id {payload.get('app_id', '?')}, {len(scopes)} scopes")
    payout_scopes = [s for s in scopes if "payouts" in s.lower()]
    record("Payouts scope granted", bool(payout_scopes),
           ", ".join(payout_scopes) if payout_scopes else
           "enable 'Payouts' on the sandbox REST app in the PayPal developer dashboard")
    return payload["access_token"]


def run_payouts(env, token, label):
    emails = [env.get("OPERATOR_A_EMAIL"), env.get("OPERATOR_B_EMAIL")]
    if not all(emails):
        return record("Payouts batch", False, "set OPERATOR_A_EMAIL and OPERATOR_B_EMAIL in .env.local")
    batch_id = f"sq-{label}-{uuid.uuid4().hex[:12]}"
    items = [
        {"recipient_type": "EMAIL", "receiver": emails[0], "sender_item_id": f"{batch_id}-A",
         "amount": {"value": MISSION_A, "currency": CURRENCY},
         "note": "SIDEQUEST mission A — sandbox test"},
        {"recipient_type": "EMAIL", "receiver": emails[1], "sender_item_id": f"{batch_id}-B",
         "amount": {"value": MISSION_B, "currency": CURRENCY},
         "note": "SIDEQUEST mission B — sandbox test"},
    ]
    venmo_phone = env.get("VENMO_TEST_PHONE")
    if venmo_phone:
        items.append({"recipient_type": "PHONE", "recipient_wallet": "VENMO", "receiver": venmo_phone,
                      "sender_item_id": f"{batch_id}-V", "amount": {"value": "1.00", "currency": CURRENCY},
                      "note": "SIDEQUEST Venmo payout test"})
    body = {"sender_batch_header": {"sender_batch_id": batch_id,
                                    "email_subject": "SIDEQUEST sandbox payout"},
            "items": items}
    status, payload, debug = call("POST", "/v1/payments/payouts", token, body, request_id=batch_id)
    if status not in (200, 201):
        return record("Payouts batch created", False, error_detail(status, payload), debug_id=debug)
    payout_batch_id = payload["batch_header"]["payout_batch_id"]
    record("Payouts batch created", True, payload["batch_header"].get("batch_status", ""),
           payout_batch_id=payout_batch_id)

    final = {"SUCCESS", "DENIED", "CANCELED"}
    batch = {}
    for _ in range(20):  # ~60s
        time.sleep(3)
        status, batch, debug = call("GET", f"/v1/payments/payouts/{payout_batch_id}", token)
        if status == 200 and batch.get("batch_header", {}).get("batch_status") in final:
            break
    batch_status = batch.get("batch_header", {}).get("batch_status", "UNKNOWN")
    record("Payouts batch final status", batch_status == "SUCCESS", batch_status)
    for item in batch.get("items", []):
        tx = item.get("transaction_status")
        sender_item = item.get("payout_item", {}).get("sender_item_id", "?")
        record(f"Payout item {sender_item[-1]}", tx == "SUCCESS",
               tx + (f" ({item['errors'].get('name')})" if item.get("errors") else ""),
               payout_item_id=item.get("payout_item_id"))
    return batch_status == "SUCCESS"


def order_create(env, token):
    request_id = f"sq-order-{uuid.uuid4().hex[:12]}"
    body = {
        "intent": "AUTHORIZE",
        "purchase_units": [{
            "reference_id": "obj_demo_001",
            "description": "SIDEQUEST objective: verify displays at Cafe A and Cafe B",
            "amount": {"currency_code": CURRENCY, "value": AUTH_TOTAL},
        }],
        "payment_source": {"paypal": {"experience_context": {
            "brand_name": "SIDEQUEST",
            "user_action": "CONTINUE",
            "shipping_preference": "NO_SHIPPING",
            "return_url": "https://example.com/sidequest/return",
            "cancel_url": "https://example.com/sidequest/cancel",
        }}},
    }
    status, payload, debug = call("POST", "/v2/checkout/orders", token, body, request_id=request_id)
    if status not in (200, 201):
        return record("Order created (AUTHORIZE)", False, error_detail(status, payload), debug_id=debug)
    order_id = payload["id"]
    link = next((l["href"] for l in payload.get("links", []) if l["rel"] in ("payer-action", "approve")), None)
    STATE_FILE.write_text(json.dumps({"order_id": order_id, "created_at": time.time()}))
    record("Order created (AUTHORIZE)", True, payload.get("status", ""), order_id=order_id)
    print("\nNext: open this link, log in with your SANDBOX PERSONAL (buyer) account, and approve:")
    print(f"  {link}")
    print("It will redirect to example.com afterwards — that's expected. Then run: order-finish")
    return True


def capture(token, auth_id, amount, request_id, final):
    body = {"amount": {"currency_code": CURRENCY, "value": amount}, "final_capture": final}
    return call("POST", f"/v2/payments/authorizations/{auth_id}/capture", token, body, request_id=request_id)


def order_finish(env, token):
    if not STATE_FILE.exists():
        return record("Load order state", False, "run order-create first")
    order_id = json.loads(STATE_FILE.read_text())["order_id"]

    status, order, debug = call("GET", f"/v2/checkout/orders/{order_id}", token)
    if order.get("status") != "APPROVED":
        return record("Order approved by buyer", False,
                      f"status is {order.get('status')}; approve it via the link first", order_id=order_id)
    record("Order approved by buyer", True, order_id=order_id)

    status, payload, debug = call("POST", f"/v2/checkout/orders/{order_id}/authorize", token, {},
                                  request_id=f"{order_id}:authorize:v1")
    if status not in (200, 201):
        return record("Authorize (funds held)", False, error_detail(status, payload), debug_id=debug)
    auth = payload["purchase_units"][0]["payments"]["authorizations"][0]
    auth_id = auth["id"]
    record("Authorize (funds held)", auth["status"] in ("CREATED", "PENDING"),
           f"{auth['status']} ${auth['amount']['value']}", authorization_id=auth_id)

    # Mission A capture
    key_a = f"{auth_id}:mission_a:capture:v1"
    status, cap_a, debug = capture(token, auth_id, MISSION_A, key_a, final=False)
    ok_a = record("Partial capture — mission A ($30)", status in (200, 201),
                  cap_a.get("status", error_detail(status, cap_a)), capture_id=cap_a.get("id"), debug_id=debug)

    # Idempotency: replay mission A capture with the same key
    if ok_a:
        status, replay, debug = capture(token, auth_id, MISSION_A, key_a, final=False)
        same = replay.get("id") == cap_a.get("id")
        record("Idempotent replay returns same capture", same,
               "no duplicate charge" if same else f"got {replay.get('id')} / {error_detail(status, replay)}")

    # Mission B capture
    status, cap_b, debug = capture(token, auth_id, MISSION_B, f"{auth_id}:mission_b:capture:v1", final=False)
    record("Partial capture — mission B ($35)", status in (200, 201),
           cap_b.get("status", error_detail(status, cap_b)), capture_id=cap_b.get("id"), debug_id=debug)

    # Void the remaining $10
    status, payload, debug = call("POST", f"/v2/payments/authorizations/{auth_id}/void", token, None,
                                  request_id=f"{auth_id}:void:v1")
    record("Void remaining authorization ($10 unused)", status in (200, 204),
           "voided" if status in (200, 204) else error_detail(status, payload), debug_id=debug)

    status, auth_now, debug = call("GET", f"/v2/payments/authorizations/{auth_id}", token)
    record("Authorization final state", status == 200, auth_now.get("status", error_detail(status, auth_now)))

    # Operator payouts funded by those captures
    run_payouts(env, token, "funded")
    STATE_FILE.unlink(missing_ok=True)
    return True


def main():
    commands = {"token", "payouts", "order-create", "order-finish"}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        print(__doc__)
        sys.exit(2)
    command = sys.argv[1]
    env = load_env()
    token = get_token(env)
    if command == "payouts":
        run_payouts(env, token, "check")
    elif command == "order-create":
        order_create(env, token)
    elif command == "order-finish":
        order_finish(env, token)
    save_results(command)


if __name__ == "__main__":
    main()
