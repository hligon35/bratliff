function createStoreCheckoutSession(cart) {
  setupPublisherStore_();
  cart = Array.isArray(cart) ? cart : [];
  const items = validateOrderItems_(cart);
  if (!items.length) throw new Error("Your cart is empty.");

  const secretKey = getStoreProperty_("STRIPE_SECRET_KEY");
  if (!secretKey)
    throw new Error(
      "Stripe is not configured. Add STRIPE_SECRET_KEY to Apps Script Properties.",
    );

  const siteUrl = getSiteUrl_().replace(/\/$/, "");
  const successUrl =
    getStoreProperty_("STORE_SUCCESS_URL") ||
    siteUrl + "/books.html?checkout=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    getStoreProperty_("STORE_CANCEL_URL") ||
    siteUrl + "/books.html?checkout=cancelled";
  const params = {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "shipping_address_collection[allowed_countries][0]": "US",
    "metadata[source]": "jackrabbit-punkin-store",
  };

  if (storeBool_(getStoreProperty_("STRIPE_AUTOMATIC_TAX")))
    params["automatic_tax[enabled]"] = "true";

  items.forEach(function (item, index) {
    params["line_items[" + index + "][quantity]"] = String(item.quantity);
    params["line_items[" + index + "][price_data][currency]"] =
      STORE_CONFIG.STORE_CURRENCY.toLowerCase();
    params["line_items[" + index + "][price_data][unit_amount]"] = String(
      Math.round(item.unitPrice * 100),
    );
    params["line_items[" + index + "][price_data][product_data][name]"] =
      item.title;
    params[
      "line_items[" + index + "][price_data][product_data][metadata][sku]"
    ] = item.sku;
  });

  const response = UrlFetchApp.fetch(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "post",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + secretKey },
      payload: params,
    },
  );

  const body = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const message =
      body && body.error && body.error.message
        ? body.error.message
        : "Stripe Checkout could not be created.";
    throw new Error(message);
  }
  return { ok: true, id: body.id, url: body.url };
}
