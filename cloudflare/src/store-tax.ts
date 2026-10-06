import type { Env } from "./types";
import { HttpError } from "./utils";

// Rates are business configuration, never inferred from a buyer or hard-coded.
// Fixed rates are suitable only for a reviewed, uniform-rate selling policy.
export function storeTaxPolicy(env: Env) {
  const mode = env.STORE_TAX_MODE;
  if (mode === "none") return { mode, percentage: 0, shippingTaxable: false };
  const rate = String(env.STORE_TAX_PERCENTAGE || "");
  if (mode !== "fixed" || !/^\d{1,2}(\.\d{1,4})?$/.test(rate) || Number(rate) <= 0 || Number(rate) > 25 || !["true", "false"].includes(env.STORE_TAX_SHIPPING || "")) {
    throw new HttpError(503, "Online checkout is temporarily unavailable. Please contact the publisher.");
  }
  return { mode, percentage: Number(rate), shippingTaxable: env.STORE_TAX_SHIPPING === "true" };
}
export function publicCheckoutConfiguration(env: Env) {
  const configured = (value?: string) => Boolean(value?.trim() && !value.startsWith("replace-"));
  try { return { available: configured(env.SQUARE_ACCESS_TOKEN) && configured(env.SQUARE_LOCATION_ID), ...storeTaxPolicy(env) }; }
  catch { return { available: false, mode: "unconfigured", percentage: 0, shippingTaxable: false }; }
}
