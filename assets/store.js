(() => {
  const STORAGE_KEY = 'jrpp_store_cart_v1';
  const siteConfig = window.siteConfig || {};
  const booksEndpoint = String(siteConfig.storeBooksEndpoint || '').trim();
  const checkoutEndpoint = String(siteConfig.storeCheckoutEndpoint || siteConfig.storeEndpoint || siteConfig.formEndpoint || '').trim();
  const state = { books: [], cart: loadCart() };

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { return []; }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
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
    return state.books;
  }

  function renderStore() {
    const grid = document.querySelector('[data-store-grid]');
    if (!grid) return;
    if (!state.books.length) {
      grid.innerHTML = '<div class="store-empty">No published books are available yet.</div>';
      return;
    }

    grid.innerHTML = state.books.map(book => {
      const purchasable = book.status === 'Published' || Boolean(book.preorder);
      const stockClass = book.stock <= book.lowStockThreshold ? 'low' : 'ok';
      const stockLabel = book.preorder ? 'Preorder available' : book.status === 'Out of Stock' ? 'Out of stock' : book.stock <= book.lowStockThreshold ? `Only ${book.stock} left` : 'In stock';
      return `<article class="store-card" data-book-id="${escapeHtml(book.bookId)}">
        <div class="store-book-image">${book.imageUrl ? `<img src="${escapeHtml(book.imageUrl)}" alt="${escapeHtml(book.title)}">` : ''}</div>
        <div>
          <div class="store-book-meta"><span>${escapeHtml(book.format || 'Book')}</span>${book.category ? `<span>· ${escapeHtml(book.category)}</span>` : ''}</div>
          <h3 style="margin-top:.45rem">${escapeHtml(book.title)}</h3>
          ${book.author ? `<p style="margin:.35rem 0;color:var(--muted)">${escapeHtml(book.author)}</p>` : ''}
          ${book.shortDescription ? `<p>${escapeHtml(book.shortDescription)}</p>` : ''}
          <div class="store-price">${money(book.price)}${book.comparePrice > book.price ? ` <del>${money(book.comparePrice)}</del>` : ''}</div>
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
    if (!book) return;
    const existing = state.cart.find(item => item.sku === sku);
    const max = book.preorder ? 99 : Math.max(0, Number(book.stock || 0));
    if (existing) existing.quantity = Math.min(existing.quantity + 1, max || 1);
    else state.cart.push({ sku: book.sku, title: book.title, price: Number(book.price || 0), imageUrl: book.imageUrl || '', quantity: 1, max: max || 1 });
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
          <div class="store-cart-head"><h2>Your Cart</h2><button class="store-cart-close" type="button" aria-label="Close cart">×</button></div>
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
      <div><h3>${escapeHtml(item.title)}</h3><div class="store-qty"><button type="button" data-qty="-1" data-sku="${escapeHtml(item.sku)}">−</button><span>${item.quantity}</span><button type="button" data-qty="1" data-sku="${escapeHtml(item.sku)}">+</button></div></div>
      <strong>${money(item.price * item.quantity)}</strong></div>`).join('');
    totalEl.textContent = money(state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
  }

  function openCart() {
    ensureCartUi();
    const backdrop = document.querySelector('.store-cart-backdrop');
    backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeCart() {
    const backdrop = document.querySelector('.store-cart-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true');
  }

  async function checkout() {
    if (!state.cart.length) return toast('Your cart is empty.');
    if (!checkoutEndpoint) return toast('Checkout is not configured yet.');
    const body = new URLSearchParams({ action: 'store-checkout', cart: JSON.stringify(state.cart.map(item => ({ sku: item.sku, quantity: item.quantity }))) });
    try {
      const response = await fetch(checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: body.toString() });
      const data = await response.json();
      if (!data.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.');
      window.location.href = data.url;
    } catch (error) { toast(error.message); }
  }

  function toast(message) {
    ensureCartUi();
    const el = document.querySelector('.store-toast');
    el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.addEventListener('click', event => {
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
    const grid = document.querySelector('[data-store-grid]');
    if (!grid) return;
    grid.innerHTML = '<div class="store-loading">Loading books…</div>';
    try { await fetchBooks(); renderStore(); } catch (error) { grid.innerHTML = `<div class="store-empty">${escapeHtml(error.message)}</div>`; }
  }

  window.JRPPStore = { init, openCart, addToCart, refresh: async () => { await fetchBooks(); renderStore(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
