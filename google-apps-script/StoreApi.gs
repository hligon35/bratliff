function routeStoreGet_(params) {
  const action = String(params.action || "");
  if (action === "store-admin") return renderStoreAdmin_();
  if (action === "store-books")
    return jsonResponse_({ ok: true, books: listPublishedStoreBooks() });
  if (action === "store-book") {
    const book = getStoreBookById(params.id || "");
    if (
      !book ||
      ["Published", "Coming Soon", "Out of Stock"].indexOf(book.status) === -1
    )
      return jsonResponse_({ ok: false, error: "Book not found." });
    return jsonResponse_({ ok: true, book: book });
  }
  if (action === "store-health")
    return jsonResponse_({ ok: true, service: "Publisher Store Manager" });
  return null;
}

function routeStorePost_(payload) {
  const action = String(payload.action || "");
  if (action === "store-checkout") {
    let cart = [];
    try {
      cart = JSON.parse(String(payload.cart || "[]"));
    } catch (error) {
      throw new Error("Invalid cart data.");
    }
    return jsonResponse_(createStoreCheckoutSession(cart));
  }
  if (action === "store-confirm-checkout") {
    return jsonResponse_(
      confirmStoreCheckoutSession(payload.sessionId || payload.session_id),
    );
  }
  return null;
}
