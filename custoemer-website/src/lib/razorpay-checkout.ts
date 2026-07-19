// Opens Razorpay Standard Checkout for delivery payment.
// When the backend returns mock:true, shows an in-app mock checkout that still
// "fires" a payment UI and resolves with pay_mock_* credentials.

export interface CheckoutOrder {
  mock: boolean;
  orderId: string;
  amountPaise: number;
  currency: string;
  publicKeyId: string;
  rentalNumber?: string;
  breakdown?: { chargePaise: number; depositPaise: number };
}

export interface CheckoutSuccess {
  orderId: string;
  paymentId: string;
  signature: string;
}

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rzp="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.dataset.rzp = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(s);
  });
}

function openMockCheckout(order: CheckoutOrder): Promise<CheckoutSuccess> {
  return new Promise((resolve, reject) => {
    const root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,15,15,.55);padding:16px;";

    const rupees = (order.amountPaise / 100).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });

    root.innerHTML = `
      <div style="width:100%;max-width:380px;border-radius:12px;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:ui-sans-serif,system-ui,sans-serif;overflow:hidden">
        <div style="background:#0b72e7;color:#fff;padding:16px 20px">
          <div style="font-size:12px;opacity:.85;letter-spacing:.04em;text-transform:uppercase">Razorpay · Test</div>
          <div style="margin-top:6px;font-size:22px;font-weight:650">${rupees}</div>
          <div style="margin-top:4px;font-size:13px;opacity:.9">${order.rentalNumber ?? "Rental payment"}</div>
        </div>
        <div style="padding:20px">
          <p style="margin:0;font-size:14px;color:#444;line-height:1.45">
            Mock checkout for local delivery payment. This simulates a successful Razorpay capture.
          </p>
          <div style="margin-top:18px;display:flex;gap:10px">
            <button type="button" data-act="cancel" style="flex:1;height:40px;border-radius:8px;border:1px solid #ddd;background:#fff;font-size:14px;cursor:pointer">Cancel</button>
            <button type="button" data-act="pay" style="flex:1;height:40px;border-radius:8px;border:0;background:#0b72e7;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Pay now</button>
          </div>
        </div>
      </div>
    `;

    const cleanup = () => root.remove();
    root.querySelector('[data-act="cancel"]')?.addEventListener("click", () => {
      cleanup();
      reject(new Error("Payment cancelled"));
    });
    root.querySelector('[data-act="pay"]')?.addEventListener("click", () => {
      const btn = root.querySelector<HTMLButtonElement>('[data-act="pay"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Processing…";
      }
      window.setTimeout(() => {
        cleanup();
        resolve({
          orderId: order.orderId,
          paymentId: `pay_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
          signature: "mock_signature",
        });
      }, 700);
    });
    document.body.appendChild(root);
  });
}

function openLiveCheckout(order: CheckoutOrder, prefill?: { name?: string; email?: string; contact?: string }): Promise<CheckoutSuccess> {
  return loadRazorpayScript().then(
    () =>
      new Promise((resolve, reject) => {
        if (!window.Razorpay) {
          reject(new Error("Razorpay unavailable"));
          return;
        }
        const rzp = new window.Razorpay({
          key: order.publicKeyId,
          amount: order.amountPaise,
          currency: order.currency || "INR",
          name: "Renton Rentals",
          description: order.rentalNumber ? `Rental ${order.rentalNumber}` : "Rental delivery payment",
          order_id: order.orderId,
          prefill: prefill || {},
          theme: { color: "#111111" },
          handler(response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) {
            resolve({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss() {
              reject(new Error("Payment cancelled"));
            },
          },
        });
        rzp.open();
      }),
  );
}

/** Open mock or live Razorpay checkout and resolve with payment credentials. */
export function openRazorpayCheckout(
  order: CheckoutOrder,
  prefill?: { name?: string; email?: string; contact?: string },
): Promise<CheckoutSuccess> {
  if (order.mock || order.publicKeyId === "rzp_test_mock" || order.orderId.startsWith("order_mock_")) {
    return openMockCheckout(order);
  }
  return openLiveCheckout(order, prefill);
}
