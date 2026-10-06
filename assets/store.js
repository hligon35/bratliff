(() => {
  const STORAGE_KEY = 'jrpp_store_cart_v1';
  const siteConfig = window.siteConfig || {};

  // siteConfig URLs (publicApiUrl, etc.) may be a comma-separated list, one per served domain.
  function pickUrlForCurrentOrigin(rawValue, fallback) {
    const candidates = String(rawValue || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!candidates.length) return fallback || '';
    const match = candidates.find((candidate) => {
      try {
        return new URL(candidate, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    });
    return match || candidates[0];
  }

  const publicApiRoot = pickUrlForCurrentOrigin(siteConfig.publicApiUrl, '').trim().replace(/\/$/, '');
  const booksEndpoint = resolveEndpoint(siteConfig.storeBooksEndpoint, '/api/store/books');
  const checkoutEndpoint = resolveEndpoint(siteConfig.storeCheckoutEndpoint || siteConfig.storeEndpoint || siteConfig.formEndpoint, '/api/store/checkout');
  const confirmCheckoutEndpoint = resolveEndpoint(siteConfig.storeConfirmEndpoint || '/api/store/confirm-checkout', '/api/store/confirm-checkout');
  const usesLegacyCheckout = /script\.google\.com/i.test(checkoutEndpoint);
  const state = { books: [], cart: loadCart(), checkout: { available: false } };

  function resolveEndpoint(configuredValue, defaultPath) {
    if (publicApiRoot) return publicApiRoot + defaultPath;
    return String(configuredValue || '').trim();
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item && typeof item.sku === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0)
        .slice(0, 20).map(item => ({ ...item, quantity: Math.min(item.quantity, 99) }));
    } catch (_) { return []; }
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart)); } catch (_) { /* Cart still works when storage is unavailable. */ }
    updateCartCount();
  }

  function money(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  async function fetchBooks() {
    const requestUrl = booksEndpoint || (checkoutEndpoint ? checkoutEndpoint + (checkoutEndpoint.includes('?') ? '&' : '?') + 'action=store-books' : '');
    if (!requestUrl) throw new Error('Store endpoint is not configured.');
    const response = await fetch(requestUrl, { cache: 'no-store' });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Could not load books.');
    state.books = Array.isArray(data.books) ? data.books : [];
    state.checkout = data.checkout || { available: false };
    reconcileCart();
    renderCart();
    updateDirectPurchaseButtons();
    return state.books;
  }

  function availableQuantity(book) {
    if (!book || (book.status !== 'Published' && !book.preorder)) return 0;
    if (!Number.isFinite(Number(book.price)) || Number(book.price) <= 0) return 0;
    return book.preorder ? 99 : Math.min(99, Math.max(0, Math.floor(Number(book.stock) || 0)));
  }

  function reconcileCart() {
    const previous = JSON.stringify(state.cart), quantities = new Map();
    state.cart.forEach(item => quantities.set(item.sku, (quantities.get(item.sku) || 0) + item.quantity));
    state.cart = [...quantities].flatMap(([sku, quantity]) => {
      const book = state.books.find(item => item.sku === sku), max = availableQuantity(book);
      return max ? [{ sku: book.sku, title: book.title, price: Number(book.price), imageUrl: book.imageUrl || '', quantity: Math.min(quantity, max), max }] : [];
    });
    saveCart();
    if (JSON.stringify(state.cart) !== previous && previous !== '[]') toast('Your cart was updated to the current prices and availability.');
  }

  function directPurchaseBook(button) {
    const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const matches = state.books.filter(book => button.dataset.storeDirectSku
      ? book.sku === button.dataset.storeDirectSku
      : normalize(book.title) === normalize(button.dataset.storeDirectTitle) && normalize(book.format) === normalize(button.dataset.storeDirectFormat));
    return matches.length === 1 ? matches[0] : null;
  }

  function updateDirectPurchaseButtons() {
    document.querySelectorAll('[data-store-direct-title], [data-store-direct-sku]').forEach(button => {
      button.hidden = !state.checkout.available || !availableQuantity(directPurchaseBook(button));
    });
  }

  function renderStore() {
    const grid = document.querySelector('[data-store-grid]');
    if (!grid) return;
    if (!state.books.length) {
      grid.innerHTML = '<div class="store-empty">Direct ordering is opening soon. You can still explore the featured books and retailer links above.</div>';
      return;
    }

    grid.innerHTML = state.books.map(book => {
      const purchasable = availableQuantity(book) > 0;
      const stockClass = book.stock <= book.lowStockThreshold ? 'low' : 'ok';
      const stockLabel = book.preorder ? 'Preorder available' : book.status === 'Out of Stock' ? 'Out of stock' : book.stock <= book.lowStockThreshold ? `Only ${book.stock} left` : 'In stock';
      return `<article class="store-card" data-book-id="${escapeHtml(book.bookId)}">
        <div class="store-book-image">${book.imageUrl ? `<img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)}" loading="lazy" decoding="async">` : ''}</div>
        <div>
          <div class="store-book-meta"><span>${escapeHtml(book.format || 'Book')}</span>${book.category ? `<span>· ${escapeHtml(book.category)}</span>` : ''}</div>
          <h3 style="margin-top:.45rem">${escapeHtml(book.title)}</h3>
          ${book.author ? `<p style="margin:.35rem 0;color:var(--muted)">${escapeHtml(book.author)}</p>` : ''}
          ${book.shortDescription ? `<p>${escapeHtml(book.shortDescription)}</p>` : ''}
          <div class="store-price">${money(book.price)}${book.comparePrice > book.price ? ` <del>${money(book.comparePrice)}</del>` : ''}</div>
          <p class="store-checkout-note">Shipping and applicable taxes calculated at checkout.</p>
          <div class="store-stock ${stockClass}">${stockLabel}</div>
        </div>
        <div class="store-actions">
          ${purchasable ? `<button class="button ink" type="button" data-add-sku="${escapeHtml(book.sku)}">${book.preorder ? 'Preorder' : 'Add to Cart'}</button>` : `<button class="button ghost" type="button" disabled>Unavailable</button>`}
        </div>
      </article>`;
    }).join('');
  }

  function addToCart(sku) {
    const book = state.books.find(item => item.sku === sku);
    const max = availableQuantity(book);
    if (!max) return toast('This book is currently unavailable.');
    const existing = state.cart.find(item => item.sku === sku);
    if (existing) existing.quantity = Math.min(existing.quantity + 1, max);
    else state.cart.push({ sku: book.sku, title: book.title, price: Number(book.price), imageUrl: book.imageUrl || '', quantity: 1, max });
    saveCart(); renderCart(); openCart(); toast(`${book.title} added to cart.`);
  }

  function changeQty(sku, delta) {
    const item = state.cart.find(entry => entry.sku === sku);
    if (!item) return;
    item.quantity = Math.max(0, Math.min(item.max || 99, item.quantity + delta));
    if (!item.quantity) state.cart = state.cart.filter(entry => entry.sku !== sku);
    saveCart(); renderCart();
  }

  function updateCartCount() {
    const count = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    document.querySelectorAll('[data-store-cart-count]').forEach(el => { el.textContent = String(count); });
  }

  function ensureCartUi() {
    if (!document.querySelector('.store-cart-backdrop')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="store-cart-backdrop" aria-hidden="true">
        <aside class="store-cart" role="dialog" aria-modal="true" aria-label="Shopping cart">
          <div class="store-cart-head"><h2>Your Cart</h2><button class="store-cart-close" type="button" aria-label="Close cart"><span class="material-icons-round" aria-hidden="true">close</span></button></div>
          <div class="store-cart-items" data-cart-items></div>
          <div class="store-cart-foot"><div class="store-cart-total"><span>Subtotal</span><span data-cart-total>$0.00</span></div><button class="button ink" style="width:100%" type="button" data-checkout>Checkout</button></div>
        </aside></div><div class="store-toast" role="status" aria-live="polite"></div>`);
    }
  }

  function renderCart() {
    ensureCartUi();
    const itemsEl = document.querySelector('[data-cart-items]');
    const totalEl = document.querySelector('[data-cart-total]');
    if (!state.cart.length) itemsEl.innerHTML = '<div class="store-empty">Your cart is empty.</div>';
    else itemsEl.innerHTML = state.cart.map(item => `<div class="store-cart-item">
      ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : '<span></span>'}
      <div><h3>${escapeHtml(item.title)}</h3><div class="store-qty"><button type="button" aria-label="Decrease quantity" data-qty="-1" data-sku="${escapeHtml(item.sku)}">−</button><span>${item.quantity}</span><button type="button" aria-label="Increase quantity" data-qty="1" data-sku="${escapeHtml(item.sku)}">+</button></div></div>
      <strong>${money(item.price * item.quantity)}</strong></div>`).join('');
    const checkoutButton = document.querySelector('[data-checkout]');
    checkoutButton.disabled = !state.cart.length || !state.checkout.available || Boolean(state.checkingOut);
    checkoutButton.textContent = state.checkout.available ? 'Checkout' : 'Online checkout unavailable';
    totalEl.textContent = money(state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
  }

  function openCart() {
    renderCart();
    const backdrop = document.querySelector('.store-cart-backdrop');
    backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('store-cart-open');
    window.JPPDialog.open(backdrop.querySelector('[role=dialog]'), closeCart);
  }

  function closeCart() {
    const backdrop = document.querySelector('.store-cart-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('store-cart-open');
    window.JPPDialog.close();
  }

  async function checkout() {
    if (state.checkingOut) return;
    if (!state.checkout.available) return toast('Online checkout is temporarily unavailable. Please contact the publisher.');
    if (!state.cart.length) return toast('Your cart is empty.');
    if (!checkoutEndpoint) return toast('Checkout is not configured yet.');
    const body = new URLSearchParams({ action: 'store-checkout', cart: JSON.stringify(state.cart.map(item => ({ sku: item.sku, quantity: item.quantity }))) });
    try {
      state.checkingOut = true;
      document.querySelectorAll('[data-checkout]').forEach(button => { button.disabled = true; });
      const response = await fetch(checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: body.toString() });
      const data = await response.json();
      if (!data.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.');
      if (typeof trackEvent === 'function') trackEvent('store_checkout_start', { meta: { itemCount: state.cart.length } });
      window.location.href = data.url;
    } catch (error) { toast(error.message); }
    finally {
      state.checkingOut = false;
      document.querySelectorAll('[data-checkout]').forEach(button => { button.disabled = !state.checkout.available; });
    }
  }

  async function confirmCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = String(params.get('checkout') || '').toLowerCase();
    if (checkoutState === 'cancelled') {
      toast('Checkout was cancelled.');
      return;
    }
    if (checkoutState !== 'success') return;

    const orderNumber = String(params.get('orderNumber') || params.get('session_id') || '').trim();
    const confirmationEndpoint = usesLegacyCheckout ? checkoutEndpoint : confirmCheckoutEndpoint;
    if (!orderNumber || !confirmationEndpoint) {
      toast('We cannot verify this checkout yet. Your cart has been kept.');
      return;
    }

    try {
      const response = await fetch(
        confirmationEndpoint,
        usesLegacyCheckout
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
              body: new URLSearchParams({ action: 'store-confirm-checkout', orderNumber }).toString()
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderNumber })
            }
      );
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Order confirmation failed.');
      if (data.paid) {
        state.cart = [];
        saveCart();
        renderCart();
      }
      toast(data.paid ? 'Payment confirmed. Thank you for your order.' : 'Payment confirmation is pending. Your cart has been kept.');
    } catch (error) {
      toast(error.message || 'Payment could not be verified yet. Your cart has been kept.');
    }
  }

  function toast(message) {
    ensureCartUi();
    const el = document.querySelector('.store-toast');
    el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.addEventListener('click', event => {
    const direct = event.target.closest('[data-store-direct-title], [data-store-direct-sku]');
    if (direct) {
      event.preventDefault();
      const book = directPurchaseBook(direct);
      if (state.checkout.available && book) addToCart(book.sku);
      return;
    }
    const add = event.target.closest('[data-add-sku]'); if (add) return addToCart(add.dataset.addSku);
    const trigger = event.target.closest('[data-store-cart-trigger]'); if (trigger) return openCart();
    if (event.target.closest('.store-cart-close')) return closeCart();
    const qty = event.target.closest('[data-qty]'); if (qty) return changeQty(qty.dataset.sku, Number(qty.dataset.qty));
    if (event.target.closest('[data-checkout]')) return checkout();
    if (event.target.classList.contains('store-cart-backdrop')) closeCart();
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCart(); });

  async function init() {
    ensureCartUi(); renderCart(); updateCartCount();
    await confirmCheckoutReturn();
    const grid = document.querySelector('[data-store-grid]');
    if (!grid) return;
    grid.innerHTML = '<div class="store-loading">Loading books…</div>';
    try { await fetchBooks(); renderStore(); } catch (error) { grid.innerHTML = `<div class="store-empty">${escapeHtml(error.message)}</div>`; }
  }

  window.JRPPStore = { init, openCart, addToCart, refresh: async () => { await fetchBooks(); renderStore(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
