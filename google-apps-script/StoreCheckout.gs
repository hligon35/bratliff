function createStoreCheckoutSession(cart) {
  setupPublisherStore_();
  cart = Array.isArray(cart) ? cart : [];
  const items = validateOrderItems_(cart);
  if (!items.length) throw new Error("Your cart is empty.");

  const secretKey = getStoreProperty_("STRIPE_SECRET_KEY");
  const connectedAccountId = getStoreProperty_("STRIPE_CONNECTED_ACCOUNT_ID");
  if (!secretKey)
    throw new Error(
      "Stripe is not configured. Add STRIPE_SECRET_KEY to Apps Script Properties.",
    );
  if (!/^acct_/i.test(connectedAccountId))
    throw new Error(
      "Stripe Connect is not configured. Add STRIPE_CONNECTED_ACCOUNT_ID to Apps Script Properties.",
    );

  const orderNumber = storeId_("JRPP");
  const platformFeeBps = getStorePlatformFeeBps_();
  const subtotalCents = items.reduce(function (sum, item) {
    return sum + Math.round(Number(item.lineTotal || 0) * 100);
  }, 0);
  const applicationFeeAmount = calculateApplicationFeeAmount_(
    subtotalCents,
    platformFeeBps,
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
    client_reference_id: orderNumber,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "shipping_address_collection[allowed_countries][0]": "US",
    "metadata[source]": "jackrabbit-punkin-store",
    "metadata[order_number]": orderNumber,
    "metadata[platform_fee_bps]": String(platformFeeBps),
    "metadata[application_fee_amount]": String(applicationFeeAmount),
    "metadata[destination_account]": connectedAccountId,
    "payment_intent_data[application_fee_amount]": String(applicationFeeAmount),
    "payment_intent_data[transfer_data][destination]": connectedAccountId,
    "payment_intent_data[on_behalf_of]": connectedAccountId,
    "payment_intent_data[metadata][source]": "jackrabbit-punkin-store",
    "payment_intent_data[metadata][order_number]": orderNumber,
    "payment_intent_data[metadata][platform_fee_bps]": String(platformFeeBps),
    "payment_intent_data[metadata][application_fee_amount]": String(applicationFeeAmount),
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
    params[
      "line_items[" + index + "][price_data][product_data][metadata][book_id]"
    ] = item.bookId;
  });

  const body = stripeRequest_("/v1/checkout/sessions", { payload: params });
  return { ok: true, id: body.id, url: body.url, orderNumber: orderNumber };
}

function confirmStoreCheckoutSession(sessionId) {
  setupPublisherStore_();
  sessionId = storeText_(sessionId, 300);
  if (!sessionId) throw new Error("A checkout session ID is required.");

  const existing = findStoreOrderBySession_(sessionId);
  if (existing)
    return { ok: true, duplicate: true, orderNumber: existing.orderNumber };

  const session = stripeRequest_(
    "/v1/checkout/sessions/" +
      encodeURIComponent(sessionId) +
      "?expand[]=line_items.data.price.product",
  );
  if (String(session.payment_status || "").toLowerCase() !== "paid") {
    throw new Error("Checkout payment is not complete yet.");
  }

  const lineItems =
    session && session.line_items && session.line_items.data
      ? session.line_items.data
      : [];
  const items = lineItems.map(function (lineItem) {
    const price = lineItem && lineItem.price ? lineItem.price : {};
    const product = price && price.product ? price.product : {};
    const metadata = product && product.metadata ? product.metadata : {};
    const sku = storeText_(metadata.sku, 100).toUpperCase();
    if (!sku) throw new Error("Stripe line item metadata is missing a SKU.");
    return {
      sku: sku,
      quantity: Math.max(1, Math.floor(storeNumber_(lineItem.quantity, 1))),
    };
  });
  if (!items.length) throw new Error("No Stripe line items were returned for this checkout.");

  const totalDetails = session.total_details || {};
  const customerDetails = session.customer_details || {};
  const metadata = session.metadata || {};
  const result = recordPaidStoreOrder({
    orderNumber: storeText_(metadata.order_number, 100) || storeText_(session.client_reference_id, 100),
    stripeSessionId: sessionId,
    stripePaymentId: storeText_(session.payment_intent, 300),
    customer: storeText_(customerDetails.name, 250),
    email: storeText_(customerDetails.email, 320),
    shipping: storeMoney_(Number(totalDetails.amount_shipping || 0) / 100),
    tax: storeMoney_(Number(totalDetails.amount_tax || 0) / 100),
    total: storeMoney_(Number(session.amount_total || 0) / 100),
    shippingAddress: formatStripeAddress_(customerDetails.address || {}),
    notes: buildStripeConnectNotes_(metadata),
    items: items,
  });
  return {
    ok: true,
    duplicate: Boolean(result && result.duplicate),
    orderNumber: result && result.orderNumber ? result.orderNumber : storeText_(metadata.order_number, 100),
  };
}

function stripeRequest_(path, options) {
  const secretKey = getStoreProperty_("STRIPE_SECRET_KEY");
  if (!secretKey)
    throw new Error(
      "Stripe is not configured. Add STRIPE_SECRET_KEY to Apps Script Properties.",
    );
  const method =
    options && options.method
      ? options.method
      : options && options.payload
        ? "post"
        : "get";
  const response = UrlFetchApp.fetch("https://api.stripe.com" + path, {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + secretKey },
    payload: options && options.payload ? options.payload : undefined,
  });
  const body = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const message =
      body && body.error && body.error.message
        ? body.error.message
        : "Stripe request failed.";
    throw new Error(message);
  }
  return body;
}

function getStorePlatformFeeBps_() {
  const raw = Math.floor(storeNumber_(getStoreProperty_("STRIPE_PLATFORM_FEE_BPS"), 250));
  return Math.max(0, Math.min(raw || 250, 10000));
}

function calculateApplicationFeeAmount_(subtotalCents, feeBps) {
  subtotalCents = Math.max(0, Math.floor(Number(subtotalCents || 0)));
  feeBps = Math.max(0, Math.floor(Number(feeBps || 0)));
  return Math.round((subtotalCents * feeBps) / 10000);
}

function formatStripeAddress_(address) {
  address = address || {};
  return [
    storeText_(address.line1, 200),
    storeText_(address.line2, 200),
    [
      storeText_(address.city, 100),
      storeText_(address.state, 100),
      storeText_(address.postal_code, 40),
    ]
      .filter(Boolean)
      .join(", "),
    storeText_(address.country, 40),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStripeConnectNotes_(metadata) {
  const feeAmount = storeMoney_(Number(metadata.application_fee_amount || 0) / 100);
  const feeBps = Math.floor(storeNumber_(metadata.platform_fee_bps, 0));
  const destination = storeText_(metadata.destination_account, 200);
  const parts = [];
  if (feeBps) parts.push("Platform fee: " + (feeBps / 100).toFixed(2) + "%");
  if (feeAmount) parts.push("Application fee amount: $" + feeAmount.toFixed(2));
  if (destination) parts.push("Destination account: " + destination);
  return parts.join(" | ");
}
