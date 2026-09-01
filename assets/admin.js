(function () {
  const siteConfig = window.siteConfig || {};
  const adminApiRoot = String(siteConfig.adminApiUrl || '').replace(/\/$/, '');
  const state = {
    books: [],
    orders: [],
    campaigns: [],
    subscribers: [],
    admins: [],
    viewer: null,
  };

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function setPanelMessage(form, message, isError) {
    const panel = form.querySelector('.form-message');
    if (!panel) return;
    panel.textContent = message;
    panel.classList.add('show');
    panel.classList.toggle('error', Boolean(isError));
  }

  function clearPanelMessage(form) {
    const panel = form.querySelector('.form-message');
    if (!panel) return;
    panel.classList.remove('show', 'error');
    panel.textContent = '';
  }

  function setStatus(message, isError) {
    const node = qs('[data-admin-status]');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#a3382a' : '';
  }

  function metricCard(label, value) {
    return '<div class="admin-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function table(columns, rows, emptyMessage) {
    if (!rows.length) return '<div class="admin-empty">' + escapeHtml(emptyMessage) + '</div>';
    return '<table class="admin-table"><thead><tr>' + columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + columns.map((column) => '<td>' + (column.render ? column.render(row) : escapeHtml(row[column.key] == null ? '' : row[column.key])) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }

  async function api(path, options) {
    if (!adminApiRoot) {
      throw new Error('PUBLIC_API_URL is not configured in assets/site-config.js yet.');
    }
    const init = options || {};
    const headers = new Headers(init.headers || {});
    let body = init.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    const response = await fetch(adminApiRoot + '/' + path.replace(/^\//, ''), {
      method: init.method || 'GET',
      body,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'The admin API request failed.');
    }
    return data;
  }

  function renderMetrics(metrics) {
    const root = qs('[data-admin-metrics]');
    if (!root || !metrics) return;
    root.innerHTML = [
      metricCard('Submissions', metrics.submissions),
      metricCard('Subscribers', metrics.subscribers),
      metricCard('Orders', metrics.orders),
      metricCard('Books', metrics.books),
      metricCard('Campaigns', metrics.campaigns),
      metricCard('Revenue', formatMoney(metrics.revenue))
    ].join('');
  }

  function renderViewer(viewer) {
    state.viewer = viewer || null;
    const node = qs('[data-admin-viewer]');
    if (!node) return;
    if (!viewer) {
      node.textContent = 'Not authenticated';
      return;
    }
    node.textContent = viewer.displayName ? viewer.displayName + ' · ' + viewer.role : viewer.email + ' · ' + viewer.role;
  }

  function renderSubmissions(rows) {
    const root = qs('[data-submissions-table]');
    if (!root) return;
    root.innerHTML = table([
      { label: 'Submitted', key: 'createdAt', render: (row) => escapeHtml(formatDate(row.createdAt)) },
      { label: 'Type', key: 'formType', render: (row) => '<span class="admin-pill">' + escapeHtml(row.formType || '') + '</span>' },
      { label: 'Contact', key: 'name', render: (row) => '<strong>' + escapeHtml(row.name || row.email || '—') + '</strong><br><span class="status-note">' + escapeHtml(row.email || '') + '</span>' },
      { label: 'Summary', key: 'summary' },
      { label: 'Status', key: 'status' }
    ], rows || [], 'No submissions were found.');
  }

  function populateBookForm(book) {
    const form = qs('#book-form');
    if (!form || !book) return;
    form.bookId.value = book.bookId || '';
    form.sku.value = book.sku || '';
    form.title.value = book.title || '';
    form.subtitle.value = book.subtitle || '';
    form.author.value = book.author || '';
    form.isbn.value = book.isbn || '';
    form.format.value = book.format || '';
    form.category.value = book.category || '';
    form.price.value = book.price || 0;
    form.comparePrice.value = book.comparePrice || 0;
    form.stock.value = book.stock || 0;
    form.lowStockThreshold.value = book.lowStockThreshold || 5;
    form.status.value = book.status || 'Draft';
    form.publicationDate.value = book.publicationDate || '';
    form.featured.checked = Boolean(book.featured);
    form.comingSoon.checked = Boolean(book.comingSoon);
    form.preorder.checked = Boolean(book.preorder);
    form.shortDescription.value = book.shortDescription || '';
    form.synopsis.value = book.synopsis || '';
  }

  function resetBookForm() {
    const form = qs('#book-form');
    if (!form) return;
    form.reset();
    form.bookId.value = '';
    clearPanelMessage(form);
  }

  function renderBooks(books) {
    state.books = Array.isArray(books) ? books : [];
    const root = qs('[data-books-table]');
    if (root) {
      root.innerHTML = table([
        { label: 'SKU', key: 'sku' },
        { label: 'Title', key: 'title', render: (row) => '<strong>' + escapeHtml(row.title) + '</strong><br><span class="status-note">' + escapeHtml(row.author || '') + '</span>' },
        { label: 'Status', key: 'status', render: (row) => '<span class="admin-pill">' + escapeHtml(row.status || '') + '</span>' },
        { label: 'Stock', key: 'stock' },
        { label: 'Price', key: 'price', render: (row) => escapeHtml(formatMoney(row.price)) },
        { label: 'Edit', key: 'bookId', render: (row) => '<div class="admin-inline-actions"><button class="button ghost" type="button" data-edit-book="' + escapeHtml(row.bookId) + '">Edit</button></div>' }
      ], state.books, 'No books have been created yet.');
    }

    const options = ['<option value="">Select a book</option>'].concat(state.books.map((book) => '<option value="' + escapeHtml(book.bookId) + '">' + escapeHtml(book.title + ' (' + book.sku + ')') + '</option>')).join('');
    qsa('[data-book-select], [data-newsletter-book-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = options;
      if (current) select.value = current;
    });
  }

  function renderOrders(orders) {
    state.orders = Array.isArray(orders) ? orders : [];
    const root = qs('[data-orders-table]');
    if (root) {
      root.innerHTML = table([
        { label: 'Order', key: 'orderNumber', render: (row) => '<strong>' + escapeHtml(row.orderNumber || '') + '</strong><br><span class="status-note">' + escapeHtml(formatDate(row.date)) + '</span>' },
        { label: 'Customer', key: 'customer', render: (row) => escapeHtml((row.customer || '—') + (row.email ? ' · ' + row.email : '')) },
        { label: 'Total', key: 'total', render: (row) => escapeHtml(formatMoney(row.total)) },
        { label: 'Payment', key: 'paymentStatus' },
        { label: 'Fulfillment', key: 'fulfillmentStatus' }
      ], state.orders, 'No orders have been recorded yet.');
    }
    const options = ['<option value="">Select an order</option>'].concat(state.orders.map((order) => '<option value="' + escapeHtml(order.orderNumber) + '">' + escapeHtml(order.orderNumber + ' · ' + (order.customer || 'Customer')) + '</option>')).join('');
    qsa('[data-order-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = options;
      if (current) select.value = current;
    });
  }

  function fillNewsletterForm(campaign, fallbackDefaults) {
    const form = qs('#newsletter-form');
    if (!form) return;
    form.reset();
    Object.keys(fallbackDefaults || {}).forEach((key) => {
      if (key in form && form[key] && typeof form[key].value !== 'undefined') {
        form[key].value = fallbackDefaults[key];
      }
    });
    if (!campaign) {
      clearPanelMessage(form);
      return;
    }
    Object.keys(campaign).forEach((key) => {
      if (key in form && form[key] && typeof form[key].value !== 'undefined') {
        form[key].value = campaign[key] == null ? '' : campaign[key];
      }
    });
  }

  function renderNewsletter(stateData) {
    const defaults = stateData.defaults || {};
    qs('[data-newsletter-meta]').textContent = stateData.subscriberCount + ' active subscribers';
    fillNewsletterForm(null, defaults);
    const campaigns = Array.isArray(stateData.campaigns) ? stateData.campaigns : [];
    const subscribers = Array.isArray(stateData.subscribers) ? stateData.subscribers : state.subscribers;
    state.campaigns = campaigns;
    const campaignsRoot = qs('[data-campaigns-table]');
    if (campaignsRoot) {
      campaignsRoot.innerHTML = table([
        { label: 'Campaign', key: 'title', render: (row) => '<strong>' + escapeHtml(row.title || row.subject || 'Untitled') + '</strong><br><span class="status-note">' + escapeHtml(row.subject || '') + '</span>' },
        { label: 'Status', key: 'status', render: (row) => '<span class="admin-pill">' + escapeHtml(row.status || '') + '</span>' },
        { label: 'Scheduled', key: 'scheduledAt', render: (row) => escapeHtml(formatDate(row.scheduledAt)) },
        { label: 'Sent', key: 'sent', render: (row) => escapeHtml(String(row.sent || 0) + '/' + String(row.recipients || 0)) },
        { label: 'Edit', key: 'campaignId', render: (row) => '<div class="admin-inline-actions"><button class="button ghost" type="button" data-edit-campaign="' + escapeHtml(row.campaignId) + '">Edit</button></div>' }
      ], campaigns, 'No campaigns saved yet.');
    }
    renderSubscribers(subscribers);
  }

  function renderSubscribers(subscribers) {
    state.subscribers = Array.isArray(subscribers) ? subscribers : [];
    const root = qs('[data-subscribers-table]');
    if (!root) return;
    root.innerHTML = table([
      { label: 'Email', key: 'email' },
      { label: 'Status', key: 'status', render: (row) => '<span class="admin-pill">' + escapeHtml(row.status || '') + '</span>' },
      { label: 'Consent', key: 'consent', render: (row) => escapeHtml(row.consent ? 'Yes' : 'No') },
      { label: 'Last Seen', key: 'lastSeenAt', render: (row) => escapeHtml(formatDate(row.lastSeenAt)) }
    ], state.subscribers.slice(0, 100), 'No subscribers have been collected yet.');
  }

  function renderAdmins(admins) {
    state.admins = Array.isArray(admins) ? admins : [];
    const root = qs('[data-admins-table]');
    if (!root) return;
    root.innerHTML = table([
      { label: 'Email', key: 'email' },
      { label: 'Role', key: 'role', render: (row) => '<span class="admin-pill">' + escapeHtml(row.role || '') + '</span>' },
      { label: 'Display Name', key: 'displayName' },
      { label: 'Remove', key: 'email', render: (row) => '<div class="admin-inline-actions"><button class="button ghost" type="button" data-remove-admin="' + escapeHtml(row.email) + '">Remove</button></div>' }
    ], state.admins, 'Only owners can view and manage the admin allow list.');
  }

  async function refreshSubmissions() {
    const filter = qs('[data-submission-filter]')?.value || '';
    const data = await api('submissions?limit=25' + (filter ? '&formType=' + encodeURIComponent(filter) : ''));
    renderSubmissions(data.rows || []);
  }

  async function loadDashboard() {
    setStatus('Connecting to the protected admin API.');
    const bootstrap = await api('bootstrap');
    renderViewer(bootstrap.viewer);
    renderMetrics(bootstrap.metrics);
    renderSubmissions(bootstrap.recentSubmissions || []);
    renderOrders(bootstrap.recentOrders || []);
    setStatus('Connected. Cloudflare Access and Google authorization are active.');
  }

  async function loadBooks() {
    const data = await api('books');
    renderBooks(data.books || []);
  }

  async function loadOrders() {
    const data = await api('orders');
    renderOrders(data.orders || []);
  }

  async function loadNewsletter() {
    const [stateData, subscribersData] = await Promise.all([
      api('newsletter/state'),
      api('newsletter/subscribers')
    ]);
    stateData.subscribers = subscribersData.subscribers || [];
    renderNewsletter(stateData);
  }

  async function loadAdmins() {
    try {
      const data = await api('admins');
      renderAdmins(data.admins || []);
    } catch (error) {
      renderAdmins([]);
    }
  }

  async function refreshAll() {
    try {
      await loadDashboard();
      await Promise.all([loadBooks(), loadOrders(), loadNewsletter(), loadAdmins()]);
    } catch (error) {
      setStatus(error.message || 'Could not load the admin console.', true);
    }
  }

  async function saveBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearPanelMessage(form);
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.featured = form.featured.checked;
    payload.comingSoon = form.comingSoon.checked;
    payload.preorder = form.preorder.checked;
    delete payload.image;
    try {
      const data = await api('books', { method: 'POST', body: payload });
      const file = form.image.files && form.image.files[0];
      if (file && data.book && data.book.bookId) {
        const upload = new FormData();
        upload.set('file', file);
        await api('books/' + encodeURIComponent(data.book.bookId) + '/image', { method: 'POST', body: upload });
      }
      setPanelMessage(form, 'Book saved.');
      form.image.value = '';
      await loadBooks();
    } catch (error) {
      setPanelMessage(form, error.message || 'Book could not be saved.', true);
    }
  }

  async function adjustInventory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearPanelMessage(form);
    try {
      await api('inventory/adjust', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
      setPanelMessage(form, 'Inventory updated.');
      form.reset();
      await loadBooks();
      await loadDashboard();
    } catch (error) {
      setPanelMessage(form, error.message || 'Inventory could not be updated.', true);
    }
  }

  async function updateOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearPanelMessage(form);
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.orderNumber) return setPanelMessage(form, 'Choose an order first.', true);
    try {
      await api('orders/' + encodeURIComponent(values.orderNumber) + '/fulfillment', {
        method: 'POST',
        body: {
          fulfillmentStatus: values.fulfillmentStatus,
          trackingNumber: values.trackingNumber,
          notes: values.notes
        }
      });
      setPanelMessage(form, 'Order updated.');
      await loadOrders();
      await loadDashboard();
    } catch (error) {
      setPanelMessage(form, error.message || 'Order could not be updated.', true);
    }
  }

  async function saveCampaign(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearPanelMessage(form);
    const values = Object.fromEntries(new FormData(form).entries());
    const featured = state.books.find((book) => book.bookId === values.featuredBookId);
    if (featured && !values.featuredBookTitle) values.featuredBookTitle = featured.title;
    if (featured && !values.featuredBookDescription) values.featuredBookDescription = featured.shortDescription || featured.synopsis;
    if (featured && !values.featuredBookImageUrl) values.featuredBookImageUrl = featured.imageUrl;
    try {
      const data = await api('newsletter/campaigns', { method: 'POST', body: values });
      form.campaignId.value = data.campaign.campaignId || '';
      setPanelMessage(form, data.campaign.status === 'Scheduled' ? 'Campaign saved and scheduled.' : 'Campaign saved as a draft.');
      await loadNewsletter();
    } catch (error) {
      setPanelMessage(form, error.message || 'Campaign could not be saved.', true);
    }
  }

  async function sendTest() {
    const form = qs('#newsletter-form');
    if (!form) return;
    clearPanelMessage(form);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const featured = state.books.find((book) => book.bookId === values.featuredBookId);
      if (featured && !values.featuredBookTitle) values.featuredBookTitle = featured.title;
      if (featured && !values.featuredBookDescription) values.featuredBookDescription = featured.shortDescription || featured.synopsis;
      if (featured && !values.featuredBookImageUrl) values.featuredBookImageUrl = featured.imageUrl;
      await api('newsletter/test', { method: 'POST', body: values });
      setPanelMessage(form, 'Test email sent.');
      await loadNewsletter();
    } catch (error) {
      setPanelMessage(form, error.message || 'Test email could not be sent.', true);
    }
  }

  async function saveAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearPanelMessage(form);
    try {
      await api('admins', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
      setPanelMessage(form, 'Admin saved.');
      form.reset();
      await loadAdmins();
    } catch (error) {
      setPanelMessage(form, error.message || 'Admin could not be saved.', true);
    }
  }

  async function removeAdmin(email) {
    if (!window.confirm('Remove admin access for ' + email + '?')) return;
    await api('admins/' + encodeURIComponent(email), { method: 'DELETE' });
    await loadAdmins();
  }

  async function exportSheets() {
    setStatus('Running a Google Sheets export.');
    try {
      await api('exports/sheets', { method: 'POST' });
      setStatus('Google Sheets export completed.');
    } catch (error) {
      setStatus(error.message || 'Google Sheets export failed.', true);
    }
  }

  document.addEventListener('click', async (event) => {
    const editBookButton = event.target.closest('[data-edit-book]');
    if (editBookButton) {
      const book = state.books.find((item) => item.bookId === editBookButton.dataset.editBook);
      return populateBookForm(book);
    }

    const editCampaignButton = event.target.closest('[data-edit-campaign]');
    if (editCampaignButton) {
      const campaign = state.campaigns.find((item) => item.campaignId === editCampaignButton.dataset.editCampaign);
      return fillNewsletterForm(campaign, {});
    }

    const removeAdminButton = event.target.closest('[data-remove-admin]');
    if (removeAdminButton) {
      try {
        await removeAdmin(removeAdminButton.dataset.removeAdmin);
      } catch (error) {
        setStatus(error.message || 'Admin could not be removed.', true);
      }
      return;
    }

    if (event.target.closest('[data-admin-refresh]')) {
      return refreshAll();
    }

    if (event.target.closest('[data-newsletter-test]')) {
      return sendTest();
    }

    if (event.target.closest('[data-newsletter-reset]')) {
      return fillNewsletterForm(null, {});
    }

    if (event.target.closest('[data-book-reset]')) {
      return resetBookForm();
    }

    if (event.target.closest('[data-export-sheets]')) {
      return exportSheets();
    }
  });

  qs('[data-submission-filter]')?.addEventListener('change', () => {
    refreshSubmissions().catch((error) => setStatus(error.message || 'Submissions could not be loaded.', true));
  });

  qs('#book-form')?.addEventListener('submit', saveBook);
  qs('#inventory-form')?.addEventListener('submit', adjustInventory);
  qs('#order-form')?.addEventListener('submit', updateOrder);
  qs('#newsletter-form')?.addEventListener('submit', saveCampaign);
  qs('#admin-form')?.addEventListener('submit', saveAdmin);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAll);
  } else {
    refreshAll();
  }
})();