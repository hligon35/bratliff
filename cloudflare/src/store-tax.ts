import type { Env } from "./types";

// Native checkout adds no sales tax. The merchant handles tax compliance
// separately; this policy does not declare the products or merchant tax-exempt.
export function publicCheckoutConfiguration(env: Env) {
  const configured = (value?: string) => Boolean(value?.trim() && !value.startsWith("replace-"));
  return { available: configured(env.SQUARE_ACCESS_TOKEN) && configured(env.SQUARE_LOCATION_ID), mode: "client-managed", percentage: 0, shippingTaxable: false };
}
