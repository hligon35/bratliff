(function () {
  const siteConfig = window.siteConfig || {};

  // siteConfig URLs (publicApiUrl, adminUrl, etc.) may be a comma-separated list, one per served domain.
  function pickUrlForCurrentOrigin(rawValue, fallback) {
    const candidates = String(rawValue || "")
      .split(",")
      .map(function (value) { return value.trim(); })
      .filter(Boolean);
    if (!candidates.length) return fallback || "";
    const match = candidates.find(function (candidate) {
      try {
        return new URL(candidate, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    });
    return match || candidates[0];
  }

  const publicApiRoot = pickUrlForCurrentOrigin(siteConfig.publicApiUrl, "").replace(/\/$/, "");
  const loginUrl = String(siteConfig.loginUrl || "login/").trim();
  const authSessionEndpoint = String(
    publicApiRoot
      ? publicApiRoot + "/api/auth/session"
      : siteConfig.authSessionEndpoint || "",
  ).replace(/\/$/, "");
  const authLogoutEndpoint = String(
    publicApiRoot
      ? publicApiRoot + "/api/auth/logout"
      : siteConfig.authLogoutEndpoint || "",
  ).replace(/\/$/, "");
  const adminApiRoot = resolveApiRoot(siteConfig.adminApiUrl, "/api/admin");
  const dashboardForms = [
    { key: "contact", label: "Contact" },
    { key: "speaking", label: "Speaking Requests" },
    { key: "bookClub", label: "Book Club Requests" },
    { key: "bookNotification", label: "Book Notifications" },
  ];
  const cacheKeys = {
    viewer: "jrpp-admin-viewer",
    dashboard: "jrpp-admin-dashboard",
  };
  const dashboardCacheTtl = 2 * 60 * 1000;
  const state = {
    page: String(document.body.getAttribute("data-admin-page") || "dashboard"),
    viewer: null,
    bootstrap: null,
    dashboardRows: {},
    dashboardLoading: {},
    books: [],
    orders: [],
    admins: [],
    campaigns: [],
    subscribers: [],
    newsletterDefaults: {},
    newsletterBooks: [],
    bookBuzzTargets: [],
    subscriberCount: 0,
    adminEmail: String(siteConfig.adminEmail || ""),
    orderFilters: {
      search: "",
      payment: "",
      fulfillment: "",
      sort: "date-desc",
    },
    inventoryFilters: {
      search: "",
      status: "",
      health: "",
      sort: "updated-desc",
    },
    sponsors: [],
    sponsorFilters: {
      status: "",
      package: "",
    },
    authors: [],
    authorFilters: {
      status: "",
    },
    analyticsRangeDays: 30,
    activityFilter: "",
    activities: [],
    selectedSponsorId: "",
  };

  function resolveApiRoot(configuredValue, defaultPath) {
    if (publicApiRoot) return publicApiRoot + defaultPath;
    return String(configuredValue || "").replace(/\/$/, "");
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function createError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function safeSessionStorage() {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  function readCache(key, maxAge) {
    const storage = safeSessionStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry !== "object") return null;
      const savedAt = Number(entry.savedAt || 0);
      if (maxAge && (!savedAt || (Date.now() - savedAt) > maxAge)) return null;
      return entry.value == null ? null : entry.value;
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    const storage = safeSessionStorage();
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify({ savedAt: Date.now(), value: value }));
    } catch {}
  }

  function clearCache(key) {
    const storage = safeSessionStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {}
  }

  function buildReturnTo() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function redirectToLogin(message) {
    const target = new URL(loginUrl || "login/", window.location.href);
    target.searchParams.set("returnTo", buildReturnTo());
    if (message) target.searchParams.set("message", message);
    window.location.replace(target.toString());
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  }

  function formatDate(value, dateOnly) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return dateOnly ? date.toLocaleDateString() : date.toLocaleString();
  }

  function tableMarkup(className, columns, rows, emptyMessage) {
    if (!rows.length) return '<div class="empty">' + escapeHtml(emptyMessage) + "</div>";
    return (
      '<table class="' + className + '"><thead><tr>' +
      columns
        .map(function (column) {
          return "<th>" + escapeHtml(column.label) + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>" +
      rows
        .map(function (row) {
          return (
            "<tr>" +
            columns
              .map(function (column) {
                const content = column.render
                  ? column.render(row)
                  : escapeHtml(row[column.key] == null ? "" : row[column.key]);
                return "<td>" + content + "</td>";
              })
              .join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    );
  }

  function setStatus(id, message, ok) {
    const node = qs(id);
    if (!node) return;
    node.textContent = message || "";
    node.className = node.className.replace(/\s(ok|err)\b/g, "").trim();
    if (ok === true) node.classList.add("ok");
    if (ok === false) node.classList.add("err");
  }

  function field(form, name) {
    return form && form.elements ? form.elements.namedItem(name) : null;
  }

  function safeValue(element) {
    return element && typeof element.value !== "undefined" ? element.value : "";
  }

  async function api(path, options) {
    if (!adminApiRoot) {
      throw new Error("PUBLIC_API_URL is not configured in assets/site-config.js yet.");
    }
    const init = options || {};
    const headers = new Headers(init.headers || {});
    let body = init.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    const response = await fetch(adminApiRoot + "/" + path.replace(/^\//, ""), {
      method: init.method || "GET",
      body: body,
      headers: headers,
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json().catch(function () {
      return {};
    });
    if (response.status === 401) {
      redirectToLogin("Please sign in with Google to continue.");
      throw createError(data.error || "Authentication is required.", response.status);
    }
    if (!response.ok || data.ok === false) {
      if (response.status === 403) {
        redirectToLogin(data.error || "Your Google account is not authorized for the admin.");
      }
      throw createError(data.error || "The admin API request failed.", response.status);
    }
    return data;
  }

  async function ensureSession() {
    if (!authSessionEndpoint) return null;
    const response = await fetch(authSessionEndpoint, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json().catch(function () {
      return {};
    });
    if (response.status === 401) {
      redirectToLogin("Please sign in with Google to continue.");
      throw createError(data.error || "Authentication is required.", response.status);
    }
    if (!response.ok || data.ok === false) {
      if (response.status === 403) {
        redirectToLogin(data.error || "Your Google account is not authorized for the admin.");
      }
      throw createError(data.error || "The admin session could not be verified.", response.status);
    }
    return data.viewer || null;
  }

  async function logout() {
    clearCache(cacheKeys.viewer);
    clearCache(cacheKeys.dashboard);
    if (authLogoutEndpoint) {
      await fetch(authLogoutEndpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      }).catch(function () {});
    }
    redirectToLogin("Signed out.");
  }

  function showWorkspace(name) {
    const map = {
      dashboard: ["jrppDashboardWorkspace", "jrppDashboardTab"],
      store: ["jrppStoreWorkspace", "jrppStoreTab"],
      newsletter: ["jrppNewsletterWorkspace", "jrppNewsletterTab"],
    };
    Object.keys(map).forEach(function (key) {
      const active = key === name;
      const workspace = document.getElementById(map[key][0]);
      const button = document.getElementById(map[key][1]);
      if (workspace) workspace.classList.toggle("show", active);
      if (button) button.classList.toggle("active", active);
    });
    window.scrollTo(0, 0);
  }

  function showStoreView(name) {
    qsa("[data-store-tab]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-store-tab") === name);
    });
    qsa("[data-store-view]").forEach(function (view) {
      view.classList.toggle("show", view.getAttribute("data-store-view") === name);
    });
  }

  function renderViewer() {
    const text = state.viewer
      ? state.viewer.email
      : "No authorized Google account is available for this request.";
    qsa("[data-viewer-email]").forEach(function (node) {
      node.textContent = text;
    });
  }

  function hydrateCachedViewer() {
    if (state.viewer) return;
    const cachedViewer = readCache(cacheKeys.viewer, 12 * 60 * 60 * 1000);
    if (!cachedViewer) return;
    state.viewer = cachedViewer;
    renderViewer();
  }

  function hydrateCachedDashboard() {
    const cachedDashboard = readCache(cacheKeys.dashboard, dashboardCacheTtl);
    if (!cachedDashboard) return false;
    state.bootstrap = cachedDashboard.bootstrap || null;
    state.dashboardRows = cachedDashboard.dashboardRows || {};
    if (cachedDashboard.viewer) state.viewer = cachedDashboard.viewer;
    renderViewer();
    renderDashboardSummary();
    renderDashboardSections();
    return true;
  }

  function persistDashboardCache() {
    writeCache(cacheKeys.dashboard, {
      viewer: state.viewer,
      bootstrap: state.bootstrap,
      dashboardRows: state.dashboardRows,
    });
  }

  function setNewsletterSubscriberPill(value) {
    const pill = qs("#subscriberPill");
    if (!pill) return;
    const count = Number(value || 0);
    pill.textContent = count + " subscriber" + (count === 1 ? "" : "s");
  }

  function renderDashboardSummary() {
    const bootstrap = state.bootstrap || {};
    const metrics = bootstrap.metrics || {};
    const root = qs("#dashboardSummary");
    if (!root) return;
    root.innerHTML = [
      '<div class="dashboard-summary-card"><div class="label">TOTAL SUBMISSIONS</div><div class="value">' + escapeHtml(String(metrics.submissions || 0)) + "</div></div>",
      '<div class="dashboard-summary-card"><div class="label">AUTHORIZED ADMIN</div><div class="copy">' + escapeHtml(state.viewer ? state.viewer.email : "") + "</div></div>",
    ].join("");
  }

  function dashboardFormCount(key) {
    const counts = state.bootstrap && state.bootstrap.formCounts ? state.bootstrap.formCounts : {};
    return Number(counts[key] || 0);
  }

  function dashboardRowsLoaded(key) {
    return Object.prototype.hasOwnProperty.call(state.dashboardRows, key);
  }

  function dashboardSectionTable(rows) {
    return tableMarkup(
      "table",
      [
        { label: "Submitted", render: function (row) { return escapeHtml(formatDate(row.createdAt)); } },
        { label: "Primary Contact", render: function (row) { return "<b>" + escapeHtml(row.name || row.email || "—") + "</b>" + (row.email ? "<br><small>" + escapeHtml(row.email) + "</small>" : ""); } },
        { label: "Summary", key: "summary" },
        { label: "Status", key: "status" },
      ],
      rows,
      "No submissions yet.",
    );
  }

  function renderDashboardSectionBody(key) {
    if (state.dashboardLoading[key]) {
      return '<div class="dashboard-detail-empty">Loading latest submissions...</div>';
    }
    if (!dashboardRowsLoaded(key)) {
      return '<div class="dashboard-detail-empty">Open this section to load the latest 10 submissions.</div>';
    }
    return dashboardSectionTable((state.dashboardRows[key] || []).slice(0, 10));
  }

  function renderDashboardSections() {
    const root = qs("#dashboardSections");
    if (!root) return;
    root.innerHTML = dashboardForms
      .map(function (section) {
        const count = dashboardFormCount(section.key);
        const visibleCount = dashboardRowsLoaded(section.key) ? Math.min((state.dashboardRows[section.key] || []).length, 10) : 10;
        return (
          '<details class="dashboard-detail" data-dashboard-section="' + escapeHtml(section.key) + '">' +
          '<summary><div class="dashboard-detail-head"><div><div class="label">' +
          escapeHtml(section.label.toUpperCase()) +
          "</div><h2>" +
          escapeHtml(String(count)) +
          ' submissions</h2></div><div class="count">Latest ' +
          escapeHtml(String(Math.min(count, visibleCount))) +
          "</div></div></summary>" +
          '<div class="dashboard-detail-body">' + renderDashboardSectionBody(section.key) + "</div></details>"
        );
      })
      .join("");
    qsa(".dashboard-detail[data-dashboard-section]").forEach(function (detail) {
      detail.addEventListener("toggle", function () {
        const sectionKey = detail.getAttribute("data-dashboard-section");
        if (detail.open && sectionKey) loadDashboardSection(sectionKey);
      });
    });
  }

  async function loadDashboardSection(sectionKey, options) {
    const force = Boolean(options && options.force);
    if (!force && (state.dashboardLoading[sectionKey] || dashboardRowsLoaded(sectionKey))) return;
    state.dashboardLoading[sectionKey] = true;
    renderDashboardSections();
    try {
      const data = await api("submissions?limit=10&formType=" + encodeURIComponent(sectionKey));
      state.dashboardRows[sectionKey] = Array.isArray(data.rows) ? data.rows : [];
      persistDashboardCache();
    } catch {
      state.dashboardRows[sectionKey] = [];
    } finally {
      state.dashboardLoading[sectionKey] = false;
      renderDashboardSections();
    }
  }

  function renderAdmins() {
    const root = qs("#adminList");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "Email", key: "email" },
        { label: "Role", render: function (row) { return '<span class="badge">' + escapeHtml(row.role || "") + "</span>"; } },
        { label: "Display Name", key: "displayName" },
        {
          label: "",
          render: function (row) {
            return '<button class="btn alt" type="button" data-remove-admin="' + escapeHtml(row.email) + '">Remove</button>';
          },
        },
      ],
      state.admins,
      "Only owners can view and manage the admin allow list.",
    );
  }

  function computeStoreMetrics() {
    const paidOrders = state.orders.filter(function (order) {
      return String(order.paymentStatus || "").toLowerCase() === "paid";
    });
    const totalSales = paidOrders.reduce(function (sum, order) {
      return sum + Number(order.total || 0);
    }, 0);
    const booksSold = paidOrders.reduce(function (sum, order) {
      if (!Array.isArray(order.items)) return sum;
      return sum + order.items.reduce(function (qty, item) {
        return qty + Number(item.quantity || 0);
      }, 0);
    }, 0);
    const lowStockCount = state.books.filter(function (book) {
      return String(book.status || "") === "Published" && Number(book.stock || 0) <= Number(book.lowStockThreshold || 0);
    }).length;
    return [
      ["Total Sales", formatMoney(totalSales)],
      ["Books Sold", booksSold || "0"],
      ["Orders", paidOrders.length],
      ["Average Order", paidOrders.length ? formatMoney(totalSales / paidOrders.length) : formatMoney(0)],
      ["Low Stock", lowStockCount],
    ];
  }

  function asTime(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function includesNeedle(parts, needle) {
    if (!needle) return true;
    const haystack = parts.join(" ").toLowerCase();
    return haystack.indexOf(needle.toLowerCase()) !== -1;
  }

  function filteredOrders() {
    const search = state.orderFilters.search.trim().toLowerCase();
    const payment = state.orderFilters.payment.toLowerCase();
    const fulfillment = state.orderFilters.fulfillment.toLowerCase();
    const rows = state.orders.filter(function (order) {
      if (payment && String(order.paymentStatus || "").toLowerCase() !== payment) return false;
      if (fulfillment && String(order.fulfillmentStatus || "").toLowerCase() !== fulfillment) return false;
      return includesNeedle([
        order.orderNumber,
        order.customer,
        order.email,
        order.trackingNumber,
      ], search);
    });
    rows.sort(function (left, right) {
      switch (state.orderFilters.sort) {
        case "date-asc":
          return asTime(left.date) - asTime(right.date);
        case "total-desc":
          return Number(right.total || 0) - Number(left.total || 0);
        case "total-asc":
          return Number(left.total || 0) - Number(right.total || 0);
        case "customer-asc":
          return String(left.customer || "").localeCompare(String(right.customer || ""));
        case "date-desc":
        default:
          return asTime(right.date) - asTime(left.date);
      }
    });
    return rows;
  }

  function filteredInventory() {
    const search = state.inventoryFilters.search.trim().toLowerCase();
    const status = state.inventoryFilters.status.toLowerCase();
    const health = state.inventoryFilters.health;
    const rows = state.books.filter(function (book) {
      const lowStock = Number(book.stock || 0) <= Number(book.lowStockThreshold || 0) && String(book.status || "") !== "Archived";
      if (status && String(book.status || "").toLowerCase() !== status) return false;
      if (health === "low" && !lowStock) return false;
      if (health === "healthy" && lowStock) return false;
      return includesNeedle([book.title, book.sku, book.author, book.category], search);
    });
    rows.sort(function (left, right) {
      switch (state.inventoryFilters.sort) {
        case "title-asc":
          return String(left.title || "").localeCompare(String(right.title || ""));
        case "title-desc":
          return String(right.title || "").localeCompare(String(left.title || ""));
        case "stock-asc":
          return Number(left.stock || 0) - Number(right.stock || 0);
        case "stock-desc":
          return Number(right.stock || 0) - Number(left.stock || 0);
        case "price-desc":
          return Number(right.price || 0) - Number(left.price || 0);
        case "price-asc":
          return Number(left.price || 0) - Number(right.price || 0);
        case "updated-desc":
        default:
          return asTime(right.updated) - asTime(left.updated);
      }
    });
    return rows;
  }

  function renderStoreMetrics() {
    const root = qs("#metrics");
    if (!root) return;
    root.innerHTML = computeStoreMetrics()
      .map(function (entry) {
        return '<div class="metric"><strong>' + escapeHtml(String(entry[1])) + '</strong><span>' + escapeHtml(entry[0]) + "</span></div>";
      })
      .join("");
  }

  function renderStoreOrders() {
    const rows = filteredOrders();
    const html = tableMarkup(
      "table",
      [
        { label: "Order", render: function (order) { return "<b>" + escapeHtml(order.orderNumber || "") + "</b>"; } },
        { label: "Date", render: function (order) { return escapeHtml(formatDate(order.date, true)); } },
        { label: "Customer", render: function (order) { return escapeHtml(order.customer || "") + (order.email ? "<br><small>" + escapeHtml(order.email) + "</small>" : ""); } },
        { label: "Total", render: function (order) { return escapeHtml(formatMoney(order.total)); } },
        { label: "Payment", key: "paymentStatus" },
        { label: "Fulfillment", key: "fulfillmentStatus" },
      ],
      rows,
      "No orders yet.",
    );
    const orderList = qs("#orderList");
    const recentOrders = qs("#recentOrders");
    if (orderList) orderList.innerHTML = html;
    if (recentOrders) {
      recentOrders.innerHTML = tableMarkup(
        "table",
        [
          { label: "Order", render: function (order) { return "<b>" + escapeHtml(order.orderNumber || "") + "</b>"; } },
          { label: "Date", render: function (order) { return escapeHtml(formatDate(order.date, true)); } },
          { label: "Customer", render: function (order) { return escapeHtml(order.customer || ""); } },
          { label: "Total", render: function (order) { return escapeHtml(formatMoney(order.total)); } },
          { label: "Status", key: "fulfillmentStatus" },
        ],
        filteredOrders().slice(0, 8),
        "No orders yet.",
      );
    }
    const select = qs("#orderNumber");
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Select an order</option>' + state.orders
        .map(function (order) {
          return '<option value="' + escapeHtml(order.orderNumber) + '">' + escapeHtml(order.orderNumber + ' · ' + (order.customer || 'Customer')) + "</option>";
        })
        .join("");
      if (current) select.value = current;
    }
    const summary = qs("#orderFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.orders.length + " orders shown";
  }

  function renderInventory() {
    const rows = filteredInventory().map(function (book) {
      const low = Number(book.stock || 0) <= Number(book.lowStockThreshold || 0) && String(book.status || "") === "Published";
      return {
        title: book.title,
        sku: book.sku,
        stock: book.stock,
        lowStockThreshold: book.lowStockThreshold,
        low: low,
      };
    });
    const root = qs("#inventoryList");
    if (root) {
      root.innerHTML = tableMarkup(
        "table",
        [
          { label: "Book", render: function (row) { return "<b>" + escapeHtml(row.title || "") + "</b>"; } },
          { label: "SKU", key: "sku" },
          { label: "Stock", key: "stock" },
          { label: "Alert At", key: "lowStockThreshold" },
          { label: "Status", render: function (row) { return '<span class="badge ' + (row.low ? 'low' : '') + '">' + (row.low ? 'Low stock' : 'Healthy') + '</span>'; } },
        ],
        rows,
        "No inventory yet.",
      );
    }
    const select = qs("#inventoryBookId");
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Select a book</option>' + state.books
        .map(function (book) {
          return '<option value="' + escapeHtml(book.bookId) + '">' + escapeHtml(book.title + ' (' + book.sku + ')') + "</option>";
        })
        .join("");
      if (current) select.value = current;
    }
    const summary = qs("#inventoryFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.books.length + " books shown";
  }

  function renderBooks() {
    const root = qs("#bookList");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "Cover", render: function (book) { return book.imageUrl ? '<img class="cover" src="' + escapeHtml(book.imageUrl) + '" alt="">' : ""; } },
        { label: "Title", render: function (book) { return "<b>" + escapeHtml(book.title || "") + "</b><br><small>" + escapeHtml(book.author || "") + "</small>"; } },
        { label: "SKU", key: "sku" },
        { label: "Price", render: function (book) { return escapeHtml(formatMoney(book.price)); } },
        { label: "Stock", key: "stock" },
        { label: "Status", render: function (book) { return '<span class="badge">' + escapeHtml(book.status || "") + "</span>"; } },
        { label: "", render: function (book) { return '<button class="btn alt" type="button" data-edit-book="' + escapeHtml(book.bookId) + '">Edit</button> <button class="btn warn" type="button" data-delete-book="' + escapeHtml(book.bookId) + '">Delete</button>'; } },
      ],
      state.books,
      "No books yet.",
    );
    renderInventory();
    renderStoreMetrics();
  }

  function resetBookForm() {
    const form = qs("#bookForm");
    if (!form) return;
    form.reset();
    const bookIdField = field(form, "bookId");
    const thresholdField = field(form, "lowStockThreshold");
    if (bookIdField) bookIdField.value = "";
    if (thresholdField) thresholdField.value = 5;
    const title = qs("#formTitle");
    if (title) title.textContent = "Add Book";
    const preview = qs("#imagePreview");
    if (preview) preview.innerHTML = "<span>No image</span>";
    setStatus("#bookStatus", "", null);
  }

  async function deleteBookRow(bookId) {
    const book = state.books.find(function (entry) {
      return entry.bookId === bookId;
    });
    if (!window.confirm("Delete " + (book ? '"' + book.title + '"' : "this book") + "? This can't be undone.")) return;
    try {
      await api("books/" + encodeURIComponent(bookId), { method: "DELETE" });
      if (safeValue(field(qs("#bookForm"), "bookId")) === bookId) resetBookForm();
      await loadBooks();
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be deleted.", false);
    }
  }

  function populateBookForm(book) {
    const form = qs("#bookForm");
    if (!form || !book) return;
    [
      "bookId",
      "sku",
      "isbn",
      "title",
      "subtitle",
      "author",
      "category",
      "format",
      "publicationDate",
      "price",
      "comparePrice",
      "stock",
      "lowStockThreshold",
      "shortDescription",
      "synopsis",
      "status",
      "squareCatalogItemId",
      "squareCatalogVariationId",
    ].forEach(function (name) {
      const control = field(form, name);
      if (control) control.value = book[name] == null ? "" : book[name];
    });
    ["featured", "comingSoon", "preorder"].forEach(function (name) {
      const control = field(form, name);
      if (control) control.checked = Boolean(book[name]);
    });
    const title = qs("#formTitle");
    if (title) title.textContent = "Edit Book";
    const preview = qs("#imagePreview");
    if (preview) {
      preview.innerHTML = book.imageUrl ? '<img src="' + escapeHtml(book.imageUrl) + '" alt="">' : "<span>No image</span>";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bookPayload() {
    const form = qs("#bookForm");
    const payload = {};
    if (!form) return payload;
    new FormData(form).forEach(function (value, key) {
      if (key !== "image") payload[key] = value;
    });
    ["featured", "comingSoon", "preorder"].forEach(function (name) {
      const control = field(form, name);
      payload[name] = Boolean(control && control.checked);
    });
    return payload;
  }

  async function saveBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("#bookStatus", "Saving...", null);
    try {
      const data = await api("books", { method: "POST", body: bookPayload() });
      const fileInput = qs("#bookImage");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      let book = data.book;
      if (file && book && book.bookId) {
        const upload = new FormData();
        upload.set("file", file);
        await api("books/" + encodeURIComponent(book.bookId) + "/image", { method: "POST", body: upload });
      }
      state.books = [];
      await loadBooks();
      book = state.books.find(function (entry) {
        return entry.bookId === (book && book.bookId);
      }) || book;
      populateBookForm(book);
      if (fileInput) fileInput.value = "";
      setStatus("#bookStatus", "Saved.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be saved.", false);
    }
  }

  async function publishCurrentBook() {
    const form = qs("#bookForm");
    if (!form) return;
    if (!safeValue(field(form, "bookId"))) {
      window.alert("Save the book first.");
      return;
    }
    const payload = bookPayload();
    payload.status = "Published";
    setStatus("#bookStatus", "Publishing...", null);
    try {
      await api("books", { method: "POST", body: payload });
      await loadBooks();
      populateBookForm(state.books.find(function (entry) {
        return entry.bookId === payload.bookId;
      }));
      setStatus("#bookStatus", "Published.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "The book could not be published.", false);
    }
  }

  async function archiveCurrentBook() {
    const form = qs("#bookForm");
    if (!form) return;
    if (!safeValue(field(form, "bookId"))) return;
    if (!window.confirm("Archive this book?")) return;
    const payload = bookPayload();
    payload.status = "Archived";
    setStatus("#bookStatus", "Archiving...", null);
    try {
      await api("books", { method: "POST", body: payload });
      await loadBooks();
      resetBookForm();
      setStatus("#bookStatus", "Archived.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "The book could not be archived.", false);
    }
  }

  async function updateOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const orderNumber = safeValue(field(form, "orderNumber"));
    if (!orderNumber) {
      setStatus("#orderStatus", "Choose an order first.", false);
      return;
    }
    setStatus("#orderStatus", "Saving...", null);
    try {
      await api("orders/" + encodeURIComponent(orderNumber) + "/fulfillment", {
        method: "POST",
        body: {
          fulfillmentStatus: safeValue(field(form, "fulfillmentStatus")),
          trackingNumber: safeValue(field(form, "trackingNumber")),
          notes: safeValue(field(form, "notes")),
        },
      });
      await loadOrders();
      setStatus("#orderStatus", "Saved.", true);
    } catch (error) {
      setStatus("#orderStatus", error.message || "Order could not be updated.", false);
    }
  }

  async function adjustInventory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("#inventoryStatus", "Applying adjustment...", null);
    try {
      await api("inventory/adjust", {
        method: "POST",
        body: {
          bookId: safeValue(field(form, "bookId")),
          change: safeValue(field(form, "change")),
          reason: safeValue(field(form, "reason")),
          notes: safeValue(field(form, "notes")),
        },
      });
      form.reset();
      const reason = field(form, "reason");
      if (reason) reason.value = "Admin adjustment";
      await loadBooks();
      setStatus("#inventoryStatus", "Inventory updated.", true);
    } catch (error) {
      setStatus("#inventoryStatus", error.message || "Inventory could not be updated.", false);
    }
  }

  function newsletterSelectedBook() {
    const id = safeValue(qs("#featuredBookId"));
    return state.newsletterBooks.find(function (book) {
      return book.bookId === id;
    }) || null;
  }

  function newsletterPayload() {
    const book = newsletterSelectedBook();
    return {
      campaignId: safeValue(qs("#campaignId")),
      title: safeValue(qs("#title")),
      subject: safeValue(qs("#subject")),
      previewText: safeValue(qs("#previewText")),
      audience: safeValue(qs("#audience")),
      targetType: safeValue(qs("#targetType")) || "all",
      targetValue: safeValue(qs("#targetType")) === "book_interest" ? safeValue(qs("#targetValue")) : "",
      fromName: safeValue(qs("#fromName")),
      heroMessage: safeValue(qs("#heroMessage")),
      heroCtaLabel: safeValue(qs("#heroCtaLabel")),
      heroCtaUrl: safeValue(qs("#heroCtaUrl")),
      featuredBookId: book ? book.bookId : "",
      featuredBookTitle: book ? book.title : "",
      featuredBookDescription: safeValue(qs("#featuredBookDescription")),
      featuredBookImageUrl: book ? book.imageUrl : "",
      featuredCtaLabel: safeValue(qs("#featuredCtaLabel")),
      featuredCtaUrl: safeValue(qs("#featuredCtaUrl")),
      quick1Title: safeValue(qs("#quick1Title")),
      quick1Text: safeValue(qs("#quick1Text")),
      quick1Url: safeValue(qs("#quick1Url")),
      quick2Title: safeValue(qs("#quick2Title")),
      quick2Text: safeValue(qs("#quick2Text")),
      quick2Url: safeValue(qs("#quick2Url")),
      closingNote: safeValue(qs("#closingNote")),
      sendDate: safeValue(qs("#sendDate")),
      sendTime: safeValue(qs("#sendTime")),
      timeZone: safeValue(qs("#timeZone")),
    };
  }

  function fillNewsletterDefaults(defaults) {
    Object.keys(defaults || {}).forEach(function (key) {
      const element = qs("#" + key);
      if (element) element.value = defaults[key] || "";
    });
    const campaignId = qs("#campaignId");
    if (campaignId) campaignId.value = "";
    toggleNewsletterTargetField();
  }

  function fillNewsletterCampaign(campaign) {
    [
      "campaignId",
      "title",
      "subject",
      "previewText",
      "audience",
      "targetType",
      "targetValue",
      "fromName",
      "heroMessage",
      "heroCtaLabel",
      "heroCtaUrl",
      "featuredBookId",
      "featuredBookDescription",
      "featuredCtaLabel",
      "featuredCtaUrl",
      "quick1Title",
      "quick1Text",
      "quick1Url",
      "quick2Title",
      "quick2Text",
      "quick2Url",
      "closingNote",
      "sendDate",
      "sendTime",
      "timeZone",
    ].forEach(function (key) {
      const element = qs("#" + key);
      if (element) element.value = campaign[key] || "";
    });
    toggleNewsletterTargetField();
    updateNewsletterPreview();
    window.scrollTo(0, 0);
  }

  function toggleNewsletterTargetField() {
    const targetType = safeValue(qs("#targetType")) || "all";
    const field = qs("#targetValueField");
    if (field) field.hidden = targetType !== "book_interest";
  }

  function campaignSavedLabel(campaign) {
    return formatDate(campaign.updated || campaign.created || "") || "—";
  }

  function campaignRecipientsLabel(campaign) {
    return campaign.recipients ? String(campaign.recipients) : "—";
  }

  function campaignScheduledLabel(campaign) {
    return formatDate(campaign.scheduledAt || "") || ((campaign.sendDate || campaign.sendTime) ? String(campaign.sendDate || "") + " " + String(campaign.sendTime || "") : "—");
  }

  function countWords(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  function updateNewsletterStats(payload, book) {
    const sections = [
      Boolean(payload.heroMessage || payload.heroCtaLabel || payload.heroCtaUrl),
      Boolean(book || payload.featuredBookDescription || payload.featuredCtaLabel || payload.featuredCtaUrl),
      Boolean(payload.quick1Title || payload.quick1Text || payload.quick1Url || payload.quick2Title || payload.quick2Text || payload.quick2Url),
      Boolean(payload.closingNote),
    ].filter(Boolean).length;
    const ctaCount = [
      payload.heroCtaUrl || payload.heroCtaLabel,
      payload.featuredCtaUrl || payload.featuredCtaLabel,
      payload.quick1Url,
      payload.quick2Url,
    ].filter(function (value) {
      return Boolean(String(value || "").trim());
    }).length;
    const estimatedWords =
      countWords(payload.title) +
      countWords(payload.subject) +
      countWords(payload.previewText) +
      countWords(payload.heroMessage) +
      countWords(book ? book.title : payload.featuredBookTitle) +
      countWords(book ? book.author : "") +
      countWords(payload.featuredBookDescription) +
      countWords(payload.quick1Title) +
      countWords(payload.quick1Text) +
      countWords(payload.quick2Title) +
      countWords(payload.quick2Text) +
      countWords(payload.closingNote);
    const sectionsNode = qs("#newsletterSectionsStat");
    const ctaNode = qs("#newsletterCtaStat");
    const wordsNode = qs("#newsletterWordsStat");
    const previewNode = qs("#newsletterPreviewStat");
    if (sectionsNode) sectionsNode.textContent = sections + "/4";
    if (ctaNode) ctaNode.textContent = String(ctaCount);
    if (wordsNode) wordsNode.textContent = estimatedWords + " / 425";
    if (previewNode) previewNode.textContent = qs("#emailWrap")?.classList.contains("mobile") ? "Mobile" : "Desktop";
  }

  function closeCampaignLibrary() {
    const overlay = qs("#campaignLibraryOverlay");
    if (overlay) overlay.hidden = true;
  }

  function openCampaignLibrary(kind) {
    const overlay = qs("#campaignLibraryOverlay");
    const title = qs("#campaignLibraryTitle");
    const body = qs("#campaignLibraryBody");
    if (!overlay || !title || !body) return;
    const scheduled = kind === "scheduled";
    const campaigns = state.campaigns.filter(function (campaign) {
      return scheduled ? campaign.status === "Scheduled" : campaign.status === "Draft";
    });
    title.textContent = scheduled ? "Scheduled Newsletters" : "Draft Newsletters";
    if (!campaigns.length) {
      body.innerHTML = '<div class="empty">No ' + (scheduled ? 'scheduled newsletters' : 'drafts') + ' yet.</div>';
    } else {
      body.innerHTML = '<table class="campaign-library-table"><thead><tr><th>' +
        (scheduled ? 'Saved' : 'Saved') +
        '</th><th>Title</th><th>Recipients</th>' +
        (scheduled ? '<th>Scheduled Time</th>' : '') +
        '<th></th></tr></thead><tbody>' + campaigns.map(function (campaign) {
          return '<tr><td>' + escapeHtml(campaignSavedLabel(campaign)) + '</td><td><strong>' + escapeHtml(campaign.title || campaign.subject || 'Untitled') + '</strong><div class="campaign-library-meta">' + escapeHtml(campaign.subject || '') + '</div></td><td>' + escapeHtml(campaignRecipientsLabel(campaign)) + '</td>' + (scheduled ? '<td>' + escapeHtml(campaignScheduledLabel(campaign)) + '</td>' : '') + '<td><button class="nl-btn secondary" type="button" data-open-campaign="' + escapeHtml(campaign.campaignId) + '">Open</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
    overlay.hidden = false;
  }

  function updateNewsletterPreview() {
    const preview = qs("#preview");
    if (!preview) return;
    const payload = newsletterPayload();
    const book = newsletterSelectedBook();
    preview.innerHTML =
      '<div class="nl-email-header"><div class="nl-email-brand"><img class="nl-logo" src="assets/jrppLogo2.png" alt="Jackrabbit Punkin Publishing"><div><h3>Jackrabbit Punkin Publishing</h3><p>Stories That Inspire. Books That Endure.</p></div></div></div>' +
      '<section class="nl-email-hero"><div class="nl-kicker">' +
      escapeHtml(payload.title || "The Jackrabbit Journal") +
      "</div><h1>" +
      escapeHtml(payload.subject || "Your newsletter subject") +
      "</h1><p>" +
      escapeHtml(payload.heroMessage || "") +
      "</p>" +
      (payload.heroCtaLabel ? '<a class="nl-cta" href="#">' + escapeHtml(payload.heroCtaLabel) + "</a>" : "") +
      "</section>" +
      (book
        ? '<section class="nl-email-section nl-feature"><div class="nl-book-cover">' +
          (book.imageUrl ? '<img src="' + escapeHtml(book.imageUrl) + '" alt="">' : escapeHtml(book.title)) +
          '</div><div><div class="nl-kicker">Featured title</div><h3>' +
          escapeHtml(book.title) +
          '</h3><div class="nl-meta">' +
          escapeHtml([book.author, book.category].filter(Boolean).join(" · ")) +
          "</div><p>" +
          escapeHtml(payload.featuredBookDescription || book.shortDescription || "") +
          "</p>" +
          (payload.featuredCtaLabel
            ? '<a href="#" style="display:inline-block;margin-top:12px;color:#542476;font-weight:700;text-decoration:none">' +
              escapeHtml(payload.featuredCtaLabel) +
              " →</a>"
            : "") +
          "</div></section>"
        : "") +
      '<section class="nl-email-section"><div class="nl-kicker">Quick updates</div><h2>A few things worth knowing</h2><div class="nl-mini-grid"><div class="nl-mini-card"><strong>' +
      escapeHtml(payload.quick1Title) +
      "</strong><p>" +
      escapeHtml(payload.quick1Text) +
      '</p></div><div class="nl-mini-card"><strong>' +
      escapeHtml(payload.quick2Title) +
      "</strong><p>" +
      escapeHtml(payload.quick2Text) +
      '</p></div></div></section><section class="nl-signoff"><p style="margin:0 0 10px;color:#4e596c;line-height:1.65">' +
      escapeHtml(payload.closingNote) +
      '</p><strong>— Jackrabbit Punkin Publishing LLC</strong></section><footer class="nl-footer"><b>Jackrabbit Punkin Publishing LLC</b><br>Stories That Inspire. Books That Endure.<br>Manage preferences · Unsubscribe</footer>';
    updateNewsletterStats(payload, book);
  }

  function renderSubscribers() {
    const root = qs("#subscriberList");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "Email", key: "email" },
        { label: "Status", key: "status" },
        { label: "Consent", render: function (row) { return row.consent ? "Yes" : "No"; } },
        { label: "Last Seen", render: function (row) { return escapeHtml(formatDate(row.lastSeenAt)); } },
      ],
      state.subscribers.slice(0, 200),
      "No subscribers yet.",
    );
  }

  function renderCampaigns() {
    const root = qs("#campaignList");
    if (!root) return;
    if (!state.campaigns.length) {
      root.innerHTML = '<div class="nl-muted">No saved campaigns yet.</div>';
      return;
    }
    const campaigns = state.campaigns.slice().sort(function (left, right) {
      return asTime(right.updated || right.created) - asTime(left.updated || left.created);
    });
    root.innerHTML =
      "<table><thead><tr><th>Campaign</th><th>Status</th><th>Delivery</th><th>Sent</th><th></th></tr></thead><tbody>" +
      campaigns
        .map(function (campaign) {
          const delivery = campaign.status === "Scheduled"
            ? campaignScheduledLabel(campaign)
            : ((campaign.sendDate || campaign.sendTime)
              ? String(campaign.sendDate || "") + " " + String(campaign.sendTime || "")
              : campaignSavedLabel(campaign));
          return (
            "<tr><td><b>" +
            escapeHtml(campaign.title || campaign.subject) +
            "</b><br><small>" +
            escapeHtml(campaign.subject || "") +
            "</small></td><td>" +
            escapeHtml(campaign.status || "") +
            "</td><td>" +
            escapeHtml(delivery) +
            "</td><td>" +
            escapeHtml(String(campaign.sent || "")) +
            "/" +
            escapeHtml(String(campaign.recipients || "")) +
            '</td><td><button class="nl-btn secondary" type="button" data-open-campaign="' +
            escapeHtml(campaign.campaignId) +
            '">Open</button>' +
            (campaign.status === "Scheduled"
              ? '<button class="nl-btn danger" type="button" style="margin-left:6px" data-cancel-campaign="' + escapeHtml(campaign.campaignId) + '">Cancel</button>'
              : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  }

  const activityActionLabels = {
    admin_login: "Admin signed in",
    admin_logout: "Admin signed out",
    newsletter_saved: "Newsletter saved",
    newsletter_test_sent: "Newsletter test sent",
    newsletter_sent: "Newsletter sent",
    newsletter_scheduled: "Newsletter scheduled",
    newsletter_cancelled: "Newsletter schedule cancelled",
  };

  function activityActionLabel(action) {
    return activityActionLabels[action] || String(action || "").replace(/_/g, " ");
  }

  function renderActivityLog() {
    qsa("[data-activity-filter]").forEach(function (button) {
      const value = button.getAttribute("data-activity-filter") || "";
      button.classList.toggle("is-active", value === state.activityFilter);
    });
    const root = qs("#activityLogTable");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "When", render: function (row) { return escapeHtml(formatDate(row.createdAt)); } },
        { label: "Activity", render: function (row) { return "<b>" + escapeHtml(activityActionLabel(row.action)) + "</b><br><small>" + escapeHtml(row.detail || "") + "</small>"; } },
        { label: "Admin", key: "adminEmail" },
      ],
      state.activities,
      "No matching activity yet.",
    );
  }

  async function loadActivity(options) {
    const root = qs("#activityLogTable");
    if (!root) return;
    const force = Boolean(options && options.force);
    if (!force && state.activities.length) {
      renderActivityLog();
      return;
    }
    setStatus("#activityLogStatus", "Loading activity...", null);
    const suffix = state.activityFilter ? "?filter=" + encodeURIComponent(state.activityFilter) : "";
    try {
      const data = await api("activity" + suffix + (suffix ? "&" : "?") + "limit=50");
      state.activities = Array.isArray(data.activities) ? data.activities : [];
      renderActivityLog();
      setStatus("#activityLogStatus", state.activities.length ? "" : "No matching activity yet.", true);
    } catch (error) {
      state.activities = [];
      renderActivityLog();
      setStatus("#activityLogStatus", error.message || "Activity could not be loaded.", false);
    }
  }

  async function loadDashboard(options) {
    const force = Boolean(options && options.force);
    if (!force && hydrateCachedDashboard()) {
      await loadActivity();
      return;
    }
    const bootstrap = await api("bootstrap");
    state.bootstrap = bootstrap;
    state.viewer = bootstrap.viewer || null;
    state.dashboardRows = force ? {} : (state.dashboardRows || {});
    state.dashboardLoading = {};
    renderViewer();
    renderDashboardSummary();
    renderDashboardSections();
    await loadActivity({ force: force });
    persistDashboardCache();
  }

  async function loadBooks() {
    const data = await api("books");
    state.books = Array.isArray(data.books) ? data.books : [];
    renderBooks();
  }

  async function loadOrders() {
    const data = await api("orders");
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    renderStoreOrders();
    renderStoreMetrics();
  }

  async function loadNewsletter() {
    const wantsSubscribers = Boolean(qs("#subscriberList"));
    const stateData = await api("newsletter/state");
    const subscribersData = wantsSubscribers ? await api("newsletter/subscribers") : { subscribers: [] };
    state.campaigns = Array.isArray(stateData.campaigns) ? stateData.campaigns : [];
    state.newsletterBooks = Array.isArray(stateData.books) ? stateData.books : [];
    state.bookBuzzTargets = Array.isArray(stateData.bookBuzzTargets) ? stateData.bookBuzzTargets : [];
    state.newsletterDefaults = stateData.defaults || {};
    state.subscriberCount = Number(stateData.subscriberCount || 0);
    state.adminEmail = String(stateData.adminEmail || state.adminEmail || "");
    state.subscribers = Array.isArray(subscribersData.subscribers) ? subscribersData.subscribers : [];
    setNewsletterSubscriberPill(state.subscriberCount);
    const featuredBook = qs("#featuredBookId");
    if (featuredBook) {
      const current = featuredBook.value;
      featuredBook.innerHTML = '<option value="">None</option>' + state.newsletterBooks
        .map(function (book) {
          return '<option value="' + escapeHtml(book.bookId) + '">' + escapeHtml(book.title) + "</option>";
        })
        .join("");
      if (current) featuredBook.value = current;
    }
    const targetValueSelect = qs("#targetValue");
    if (targetValueSelect) {
      const current = targetValueSelect.value;
      targetValueSelect.innerHTML = '<option value="">Select a title</option>' + state.bookBuzzTargets
        .map(function (target) {
          return '<option value="' + escapeHtml(target.title) + '">' + escapeHtml(target.title) + " (" + Number(target.signups || 0) + " signups)</option>";
        })
        .join("");
      if (current) targetValueSelect.value = current;
    }
    toggleNewsletterTargetField();
    if (!safeValue(qs("#subject"))) fillNewsletterDefaults(state.newsletterDefaults);
    renderCampaigns();
    renderSubscribers();
    updateNewsletterPreview();
  }

  async function loadAdmins() {
    try {
      const data = await api("admins");
      state.admins = Array.isArray(data.admins) ? data.admins : [];
    } catch {
      state.admins = [];
    }
    renderAdmins();
  }

  async function saveAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setStatus("#adminStatus", "Saving...", null);
    try {
      await api("admins", {
        method: "POST",
        body: {
          email: safeValue(field(form, "email")),
          displayName: safeValue(field(form, "displayName")),
          role: safeValue(field(form, "role")),
        },
      });
      form.reset();
      await loadAdmins();
      setStatus("#adminStatus", "Admin saved.", true);
    } catch (error) {
      setStatus("#adminStatus", error.message || "Admin could not be saved.", false);
    }
  }

  async function removeAdmin(email) {
    if (!window.confirm("Remove admin access for " + email + "?")) return;
    await api("admins/" + encodeURIComponent(email), { method: "DELETE" });
    await loadAdmins();
  }

  async function loadSponsors() {
    const params = new URLSearchParams();
    if (state.sponsorFilters.status) params.set("status", state.sponsorFilters.status);
    if (state.sponsorFilters.package) params.set("package", state.sponsorFilters.package);
    const query = params.toString();
    const data = await api("sponsors" + (query ? "?" + query : ""));
    state.sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
    renderSponsorList();
    if (state.selectedSponsorId) {
      const selected = state.sponsors.find(function (entry) {
        return entry.id === state.selectedSponsorId;
      });
      if (selected) populateSponsorForm(selected);
      else resetSponsorForm();
    }
  }

  function renderSponsorList() {
    const packageLabels = {
      pagePal: "Page Pal",
      chapterChampion: "Chapter Champion",
      bookshelfBuilder: "Bookshelf Builder",
      literacyTrailblazer: "Literacy Trailblazer",
    };
    const markup = tableMarkup(
      "table",
      [
        { label: "Sponsor", render: function (row) { return escapeHtml(row.displayName || row.payerName || row.id); } },
        { label: "Package", render: function (row) { return escapeHtml(packageLabels[row.package] || row.package); } },
        { label: "Books", key: "booksSponsored" },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.recognitionStatus) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            return '<button class="btn alt" type="button" data-edit-sponsor="' + escapeHtml(row.id) + '">View</button> <button class="btn warn" type="button" data-delete-sponsor="' + escapeHtml(row.id) + '">Delete</button>';
          },
        },
      ],
      state.sponsors,
      "No sponsors match these filters.",
    );
    const list = qs("#sponsorList");
    if (list) list.innerHTML = markup;
  }

  function resetSponsorForm() {
    state.selectedSponsorId = "";
    const title = qs("#sponsorFormTitle");
    if (title) title.textContent = "Sponsor Details";
    const summary = qs("#sponsorDetailSummary");
    if (summary) summary.innerHTML = '<div class="sponsor-detail-empty">Select a sponsor to review their recognition details.</div>';
    const logo = qs("#sponsorLogoDisplay");
    if (logo) logo.innerHTML = "<span>No logo submitted</span>";
    setStatus("#sponsorStatus", "", null);
  }

  async function deleteSponsorRow(sponsorId) {
    const sponsor = state.sponsors.find(function (entry) {
      return entry.id === sponsorId;
    });
    const label = sponsor ? sponsor.displayName || sponsor.payerName || sponsorId : "this sponsor";
    if (!window.confirm("Delete " + label + "? This can't be undone.")) return;
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId), { method: "DELETE" });
      if (state.selectedSponsorId === sponsorId) resetSponsorForm();
      await loadSponsors();
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be deleted.", false);
    }
  }

  function populateSponsorForm(sponsor) {
    if (!sponsor) return;
    state.selectedSponsorId = sponsor.id || "";
    const packageLabels = {
      pagePal: "Page Pal",
      chapterChampion: "Chapter Champion",
      bookshelfBuilder: "Bookshelf Builder",
      literacyTrailblazer: "Literacy Trailblazer",
    };
    const recognitionName = sponsor.anonymous ? "Anonymous sponsor" : (sponsor.displayName || "Not provided");
    const website = sponsor.websiteUrl
      ? '<a href="' + escapeHtml(sponsor.websiteUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(sponsor.websiteUrl) + "</a>"
      : "Not provided";
    const detail = qs("#sponsorDetailSummary");
    if (detail) {
      detail.innerHTML =
        '<div class="sponsor-detail-status"><span class="badge">' + escapeHtml(sponsor.recognitionStatus || "Awaiting Payment") + "</span></div>" +
        '<dl class="sponsor-detail-grid">' +
        '<div><dt>Sponsor</dt><dd>' + escapeHtml(recognitionName) + "</dd></div>" +
        '<div><dt>Package</dt><dd>' + escapeHtml(packageLabels[sponsor.package] || sponsor.package || "—") + "</dd></div>" +
        '<div><dt>Payer name</dt><dd>' + escapeHtml(sponsor.payerName || "—") + "</dd></div>" +
        '<div><dt>Payer email</dt><dd><a href="mailto:' + escapeHtml(sponsor.payerEmail || "") + '">' + escapeHtml(sponsor.payerEmail || "—") + "</a></dd></div>" +
        '<div><dt>Books sponsored</dt><dd>' + escapeHtml(String(sponsor.booksSponsored || 0)) + "</dd></div>" +
        '<div><dt>Amount</dt><dd>' + (Number(sponsor.amountPaidCents || 0) ? escapeHtml(formatMoney(Number(sponsor.amountPaidCents || 0) / 100)) : "Pending payment") + "</dd></div>" +
        '<div><dt>Entity type</dt><dd>' + escapeHtml(sponsor.entityType || "Individual") + "</dd></div>" +
        '<div><dt>Website</dt><dd>' + website + "</dd></div>" +
        '<div><dt>Public recognition</dt><dd>' + escapeHtml(sponsor.anonymous ? "Anonymous" : (sponsor.displayName || "Not provided")) + "</dd></div>" +
        '<div><dt>Permission to publish</dt><dd>' + escapeHtml(sponsor.publishPermission ? "Granted" : "Not granted") + "</dd></div>" +
        '<div class="sponsor-detail-wide"><dt>Admin notes</dt><dd>' + escapeHtml(sponsor.adminNotes || "No internal notes.") + "</dd></div>" +
        "</dl>";
    }
    const logo = qs("#sponsorLogoDisplay");
    if (logo) {
      logo.innerHTML = sponsor.logoUrl
        ? '<img src="' + escapeHtml(sponsor.logoUrl) + '" alt="' + escapeHtml(sponsor.logoAlt || recognitionName) + '">'
        : "<span>No logo submitted</span>";
    }
    const title = qs("#sponsorFormTitle");
    if (title) title.textContent = "Sponsor Details";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function publishCurrentSponsor() {
    const sponsorId = state.selectedSponsorId;
    if (!sponsorId) {
      window.alert("Save the sponsor first.");
      return;
    }
    setStatus("#sponsorStatus", "Publishing...", null);
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId) + "/publish", { method: "POST" });
      await loadSponsors();
      const sponsor = state.sponsors.find(function (entry) {
        return entry.id === sponsorId;
      });
      if (sponsor) populateSponsorForm(sponsor);
      setStatus("#sponsorStatus", "Published.", true);
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be published.", false);
    }
  }

  async function hideCurrentSponsor() {
    const sponsorId = state.selectedSponsorId;
    if (!sponsorId) return;
    setStatus("#sponsorStatus", "Hiding...", null);
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId) + "/hide", { method: "POST" });
      await loadSponsors();
      const sponsor = state.sponsors.find(function (entry) {
        return entry.id === sponsorId;
      });
      if (sponsor) populateSponsorForm(sponsor);
      setStatus("#sponsorStatus", "Hidden.", true);
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be hidden.", false);
    }
  }

  async function loadAuthors() {
    const params = new URLSearchParams();
    if (state.authorFilters.status) params.set("status", state.authorFilters.status);
    const query = params.toString();
    const data = await api("authors" + (query ? "?" + query : ""));
    state.authors = Array.isArray(data.authors) ? data.authors : [];
    renderAuthorList();
  }

  function renderAuthorList() {
    const markup = tableMarkup(
      "table",
      [
        { label: "Author", render: function (row) { return escapeHtml(row.name || row.id); } },
        { label: "Title", render: function (row) { return escapeHtml(row.title || "—"); } },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.status) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            return '<button class="btn alt" type="button" data-edit-author="' + escapeHtml(row.id) + '">Edit</button> <button class="btn warn" type="button" data-delete-author="' + escapeHtml(row.id) + '">Delete</button>';
          },
        },
      ],
      state.authors,
      "No authors yet. Create one below.",
    );
    const list = qs("#authorList");
    if (list) list.innerHTML = markup;
  }

  function resetAuthorForm() {
    const form = qs("#authorForm");
    if (!form) return;
    form.reset();
    const authorIdField = field(form, "authorId");
    if (authorIdField) authorIdField.value = "";
    const title = qs("#authorFormTitle");
    if (title) title.textContent = "New Author";
    const preview = qs("#authorPortraitPreview");
    if (preview) preview.innerHTML = "<span>No portrait</span>";
    setStatus("#authorStatus", "", null);
  }

  async function deleteAuthorRow(authorId) {
    const author = state.authors.find(function (entry) {
      return entry.id === authorId;
    });
    const label = author ? author.name || authorId : "this author";
    if (!window.confirm("Delete " + label + "? This can't be undone.")) return;
    try {
      await api("authors/" + encodeURIComponent(authorId), { method: "DELETE" });
      if (safeValue(field(qs("#authorForm"), "authorId")) === authorId) resetAuthorForm();
      await loadAuthors();
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be deleted.", false);
    }
  }

  function populateAuthorForm(author) {
    const form = qs("#authorForm");
    if (!form || !author) return;
    [
      "authorId",
      "name",
      "title",
      "shortIntro",
      "biography",
      "websiteUrl",
      "ctaLabel",
      "ctaUrl",
      "startAt",
      "endAt",
      "displayOrder",
    ].forEach(function (name) {
      const control = field(form, name === "authorId" ? "authorId" : name);
      if (!control) return;
      const sourceKey = name === "authorId" ? "id" : name;
      control.value = author[sourceKey] == null ? "" : author[sourceKey];
    });
    const socialLinksField = field(form, "socialLinks");
    if (socialLinksField) {
      let links = [];
      try {
        links = JSON.parse(author.socialLinks || "[]");
      } catch {
        links = [];
      }
      socialLinksField.value = Array.isArray(links) ? links.join("\n") : "";
    }
    const relatedBooksField = field(form, "relatedBookIds");
    if (relatedBooksField) {
      let ids = [];
      try {
        ids = JSON.parse(author.relatedBookIds || "[]");
      } catch {
        ids = [];
      }
      relatedBooksField.value = Array.isArray(ids) ? ids.join("\n") : "";
    }
    const title = qs("#authorFormTitle");
    if (title) title.textContent = "Edit Author";
    const preview = qs("#authorPortraitPreview");
    if (preview) {
      preview.innerHTML = author.portraitUrl ? '<img src="' + escapeHtml(author.portraitUrl) + '" alt="">' : "<span>No portrait</span>";
    }
    const statusPill = qs("#authorStatusPill");
    if (statusPill) statusPill.textContent = author.status || "Draft";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function authorPayload() {
    const form = qs("#authorForm");
    const payload = {};
    if (!form) return payload;
    new FormData(form).forEach(function (value, key) {
      if (key !== "portrait" && key !== "socialLinks" && key !== "relatedBookIds") payload[key] = value;
    });
    const socialLinksField = field(form, "socialLinks");
    payload.socialLinks = JSON.stringify(
      String(socialLinksField ? socialLinksField.value : "")
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean),
    );
    const relatedBooksField = field(form, "relatedBookIds");
    payload.relatedBookIds = JSON.stringify(
      String(relatedBooksField ? relatedBooksField.value : "")
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean),
    );
    return payload;
  }

  async function saveAuthor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setStatus("#authorStatus", "Saving...", null);
    try {
      const data = await api("authors", { method: "POST", body: authorPayload() });
      const fileInput = qs("#authorPortrait");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      let author = data.author;
      if (file && author && author.id) {
        const upload = new FormData();
        upload.set("file", file);
        await api("authors/" + encodeURIComponent(author.id) + "/portrait", { method: "POST", body: upload });
      }
      await loadAuthors();
      author = state.authors.find(function (entry) {
        return entry.id === (author && author.id);
      }) || author;
      if (author) populateAuthorForm(author);
      if (fileInput) fileInput.value = "";
      setStatus("#authorStatus", "Saved.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be saved.", false);
    }
  }

  async function publishCurrentAuthor() {
    const form = qs("#authorForm");
    const authorId = form ? safeValue(field(form, "authorId")) : "";
    if (!authorId) {
      window.alert("Save the author first.");
      return;
    }
    setStatus("#authorStatus", "Publishing...", null);
    try {
      await api("authors/" + encodeURIComponent(authorId) + "/publish", { method: "POST" });
      await loadAuthors();
      const author = state.authors.find(function (entry) {
        return entry.id === authorId;
      });
      if (author) populateAuthorForm(author);
      setStatus("#authorStatus", "Published to the Media page spotlight.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be published.", false);
    }
  }

  async function hideCurrentAuthor() {
    const form = qs("#authorForm");
    const authorId = form ? safeValue(field(form, "authorId")) : "";
    if (!authorId) return;
    setStatus("#authorStatus", "Hiding...", null);
    try {
      await api("authors/" + encodeURIComponent(authorId) + "/hide", { method: "POST" });
      await loadAuthors();
      const author = state.authors.find(function (entry) {
        return entry.id === authorId;
      });
      if (author) populateAuthorForm(author);
      setStatus("#authorStatus", "Hidden.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be hidden.", false);
    }
  }

  async function loadAnalytics() {
    const data = await api("analytics/summary?days=" + encodeURIComponent(state.analyticsRangeDays));
    renderAnalytics(data);
  }

  function formatShortDay(value) {
    const parts = String(value || "").split("-");
    if (parts.length !== 3) return String(value || "");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[Number(parts[1]) - 1] || parts[1];
    return monthName + " " + Number(parts[2]);
  }

  function buildTrendChart(rows) {
    const width = 720;
    const height = 260;
    const padLeft = 44;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 34;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const max = rows.reduce(function (highest, row) { return Math.max(highest, row.count); }, 0) || 1;
    const stepX = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
    const points = rows.map(function (row, index) {
      return {
        x: padLeft + stepX * index,
        y: padTop + plotHeight - (row.count / max) * plotHeight,
        day: row.day,
        count: row.count,
      };
    });
    const linePath = points
      .map(function (point, index) {
        return (index === 0 ? "M" : "L") + point.x.toFixed(1) + "," + point.y.toFixed(1);
      })
      .join(" ");
    const gridLines = [0, 0.5, 1]
      .map(function (fraction) {
        const y = padTop + plotHeight * (1 - fraction);
        return (
          '<line class="analytics-chart-grid" x1="' + padLeft + '" y1="' + y.toFixed(1) + '" x2="' + (width - padRight) + '" y2="' + y.toFixed(1) + '"></line>' +
          '<text class="analytics-chart-axis" x="' + (padLeft - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(String(Math.round(max * fraction))) + "</text>"
        );
      })
      .join("");
    const labelStep = Math.max(1, Math.ceil(points.length / 7));
    const xLabels = points
      .map(function (point, index) {
        if (index % labelStep !== 0 && index !== points.length - 1) return "";
        return (
          '<text class="analytics-chart-axis" x="' + point.x.toFixed(1) + '" y="' + (height - padBottom + 18) + '" text-anchor="middle">' +
          escapeHtml(formatShortDay(point.day)) +
          "</text>"
        );
      })
      .join("");
    const dots = points
      .map(function (point) {
        return (
          '<circle class="analytics-chart-dot" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3.5">' +
          "<title>" + escapeHtml(formatShortDay(point.day)) + ": " + escapeHtml(String(point.count)) + "</title>" +
          "</circle>"
        );
      })
      .join("");
    return (
      '<svg class="analytics-chart" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Daily page views line chart">' +
      gridLines +
      xLabels +
      '<path class="analytics-chart-line" d="' + linePath + '"></path>' +
      dots +
      "</svg>"
    );
  }

  function renderAnalytics(data) {
    const metrics = qs("#analyticsMetrics");
    if (metrics) {
      metrics.innerHTML =
        '<div class="metric"><strong>' + escapeHtml(String(data.totalPageViews || 0)) + '</strong><span>Page Views</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalEvents || 0)) + '</strong><span>Total Events</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalSponsors || 0)) + '</strong><span>Paid Sponsorships</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(formatMoney(data.totalSponsorRevenue || 0)) + '</strong><span>Sponsorship Revenue</span></div>';
    }

    const topPages = qs("#analyticsTopPages");
    if (topPages) {
      topPages.innerHTML = tableMarkup(
        "table",
        [
          { label: "Page", render: function (row) { return escapeHtml(row.pagePath || "/"); } },
          { label: "Views", key: "count" },
        ],
        data.topPages || [],
        "No page view data yet.",
      );
    }

    const eventBreakdown = qs("#analyticsEventBreakdown");
    if (eventBreakdown) {
      eventBreakdown.innerHTML = tableMarkup(
        "table",
        [
          { label: "Event", render: function (row) { return escapeHtml(row.eventType); } },
          { label: "Count", key: "count" },
        ],
        data.eventBreakdown || [],
        "No events recorded yet.",
      );
    }

    const trend = qs("#analyticsTrend");
    if (trend) {
      const rows = data.dailyTrend || [];
      trend.innerHTML = rows.length ? buildTrendChart(rows) : '<p class="asset-note">No page view data yet.</p>';
    }

    const sponsorBreakdown = qs("#analyticsSponsorBreakdown");
    if (sponsorBreakdown) {
      sponsorBreakdown.innerHTML = tableMarkup(
        "table",
        [
          { label: "Package", render: function (row) { return escapeHtml(row.label || row.package || ""); } },
          { label: "Paid Sponsorships", key: "sponsorCount" },
          { label: "Revenue", render: function (row) { return escapeHtml(formatMoney(row.totalRevenue)); } },
        ],
        data.sponsorBreakdown || [],
        "No paid sponsorships in this range yet.",
      );
    }
  }

  async function saveNewsletterDraft() {
    try {
      setStatus("#status", "Saving draft...", null);
      const payload = newsletterPayload();
      payload.status = "Draft";
      const data = await api("newsletter/campaigns", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId) campaignId.value = data.campaign && data.campaign.campaignId ? data.campaign.campaignId : "";
      await loadNewsletter();
      setStatus("#status", "Draft saved.", true);
    } catch (error) {
      setStatus("#status", error.message || "Draft could not be saved.", false);
    }
  }

  async function sendNewsletterTest() {
    const email = window.prompt("Send a test to which email address?", state.adminEmail || "");
    if (!email) return;
    try {
      setStatus("#status", "Sending test...", null);
      const payload = newsletterPayload();
      payload.testEmail = email;
      const data = await api("newsletter/test", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId && data.campaignId) campaignId.value = data.campaignId;
      await loadNewsletter();
      setStatus("#status", data.message || ("Test email sent to " + email + "."), true);
    } catch (error) {
      setStatus("#status", error.message || "Test email could not be sent.", false);
    }
  }

  async function scheduleNewsletter() {
    const payload = newsletterPayload();
    const shouldSchedule = Boolean(payload.sendDate || payload.sendTime);
    const prompt = shouldSchedule
      ? "Schedule this newsletter using the selected date, time, and time zone?"
      : "No delivery date is set. Send this newsletter now to all active subscribers?";
    if (!window.confirm(prompt)) return;
    try {
      if (shouldSchedule) {
        setStatus("#status", "Scheduling...", null);
        payload.status = "Scheduled";
        const data = await api("newsletter/campaigns", { method: "POST", body: payload });
        const campaignId = qs("#campaignId");
        if (campaignId && data.campaign && data.campaign.campaignId) campaignId.value = data.campaign.campaignId;
        await loadNewsletter();
        setStatus("#status", "Newsletter scheduled.", true);
        return;
      }
      setStatus("#status", "Sending newsletter...", null);
      const sendResult = await api("newsletter/send", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId && sendResult.campaignId) campaignId.value = sendResult.campaignId;
      await loadNewsletter();
      setStatus("#status", sendResult.message || "Newsletter sent.", true);
    } catch (error) {
      setStatus("#status", error.message || "Newsletter could not be scheduled.", false);
    }
  }

  async function cancelNewsletterSchedule(campaignId) {
    try {
      setStatus("#status", "Cancelling schedule...", null);
      await api("newsletter/campaigns/" + encodeURIComponent(campaignId) + "/cancel", { method: "POST" });
      await loadNewsletter();
      setStatus("#status", "Schedule cancelled.", true);
    } catch (error) {
      setStatus("#status", error.message || "Schedule could not be cancelled.", false);
    }
  }

  async function refreshCurrentPage(options) {
    const force = Boolean(options && options.force);
    try {
      if (state.page === "dashboard" && !force) hydrateCachedDashboard();
      else hydrateCachedViewer();
      state.viewer = await ensureSession();
      writeCache(cacheKeys.viewer, state.viewer);
      if (state.page === "dashboard") {
        await loadDashboard({ force: force });
      } else if (state.page === "profile") {
        await loadAdmins();
      } else if (state.page === "store") {
        await Promise.all([loadBooks(), loadOrders()]);
        showStoreView(window.location.hash.replace(/^#/, "") || "overview");
      } else if (state.page === "newsletter") {
        await loadNewsletter();
      } else if (state.page === "sponsors") {
        await loadSponsors();
      } else if (state.page === "author") {
        await loadAuthors();
      } else if (state.page === "analytics") {
        await loadAnalytics();
      }
      renderViewer();
    } catch (error) {
      const dashboardEmail = qs("#dashboardViewerEmail");
      if (dashboardEmail) dashboardEmail.textContent = error.message || "Could not load the admin console.";
      setStatus("#bookStatus", error.message || "Could not load the admin console.", false);
      setStatus("#adminStatus", error.message || "Could not load the admin console.", false);
      setStatus("#status", error.message || "Could not load the admin console.", false);
    }
  }

  document.addEventListener("click", function (event) {
    const activityFilterButton = event.target.closest("[data-activity-filter]");
    if (activityFilterButton) {
      state.activityFilter = activityFilterButton.getAttribute("data-activity-filter") || "";
      loadActivity({ force: true });
      return;
    }

    const activityRefreshButton = event.target.closest("#activityRefreshBtn");
    if (activityRefreshButton) {
      loadActivity({ force: true });
      return;
    }

    const storeTab = event.target.closest("[data-store-tab]");
    if (storeTab) {
      showStoreView(storeTab.getAttribute("data-store-tab"));
      if (state.page === "store") {
        window.history.replaceState(null, "", "#" + storeTab.getAttribute("data-store-tab"));
      }
      return;
    }

    const editBookButton = event.target.closest("[data-edit-book]");
    if (editBookButton) {
      populateBookForm(
        state.books.find(function (book) {
          return book.bookId === editBookButton.getAttribute("data-edit-book");
        }),
      );
      return;
    }

    const deleteBookButton = event.target.closest("[data-delete-book]");
    if (deleteBookButton) {
      deleteBookRow(deleteBookButton.getAttribute("data-delete-book"));
      return;
    }

    const editSponsorButton = event.target.closest("[data-edit-sponsor]");
    if (editSponsorButton) {
      populateSponsorForm(
        state.sponsors.find(function (sponsor) {
          return sponsor.id === editSponsorButton.getAttribute("data-edit-sponsor");
        }),
      );
      return;
    }

    const deleteSponsorButton = event.target.closest("[data-delete-sponsor]");
    if (deleteSponsorButton) {
      deleteSponsorRow(deleteSponsorButton.getAttribute("data-delete-sponsor"));
      return;
    }

    const editAuthorButton = event.target.closest("[data-edit-author]");
    if (editAuthorButton) {
      populateAuthorForm(
        state.authors.find(function (author) {
          return author.id === editAuthorButton.getAttribute("data-edit-author");
        }),
      );
      return;
    }

    const deleteAuthorButton = event.target.closest("[data-delete-author]");
    if (deleteAuthorButton) {
      deleteAuthorRow(deleteAuthorButton.getAttribute("data-delete-author"));
      return;
    }

    const removeAdminButton = event.target.closest("[data-remove-admin]");
    if (removeAdminButton) {
      removeAdmin(removeAdminButton.getAttribute("data-remove-admin")).catch(function (error) {
        setStatus("#adminStatus", error.message || "Admin could not be removed.", false);
      });
      return;
    }

    const openCampaignButton = event.target.closest("[data-open-campaign]");
    if (openCampaignButton) {
      const campaign = state.campaigns.find(function (entry) {
        return entry.campaignId === openCampaignButton.getAttribute("data-open-campaign");
      });
      if (campaign) {
        fillNewsletterCampaign(campaign);
        closeCampaignLibrary();
      }
      return;
    }

    const cancelCampaignButton = event.target.closest("[data-cancel-campaign]");
    if (cancelCampaignButton) {
      cancelNewsletterSchedule(cancelCampaignButton.getAttribute("data-cancel-campaign"));
      return;
    }

    if (event.target === qs("#campaignLibraryOverlay")) {
      closeCampaignLibrary();
    }
  });

  qs("#globalRefreshBtn")?.addEventListener("click", function () {
    clearCache(cacheKeys.dashboard);
    refreshCurrentPage({ force: true });
  });
  qs("#globalLogoutBtn")?.addEventListener("click", logout);
  qs("#setupBtn")?.addEventListener("click", function () {
    refreshCurrentPage().then(function () {
      window.alert("Publisher Store Manager is ready.");
    });
  });
  qs("#syncSquareStockBtn")?.addEventListener("click", async function () {
    const button = qs("#syncSquareStockBtn");
    if (button) { button.disabled = true; button.textContent = "Syncing..."; }
    try {
      const data = await api("inventory/sync-square", { method: "POST" });
      await loadBooks();
      window.alert("Square stock sync complete. " + (data.updated || 0) + " book(s) updated.");
    } catch (error) {
      window.alert(error.message || "Square stock sync failed.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Sync Square Stock"; }
    }
  });
  qs("#newBookBtn")?.addEventListener("click", resetBookForm);
  qs("#publishBtn")?.addEventListener("click", publishCurrentBook);
  qs("#archiveBtn")?.addEventListener("click", archiveCurrentBook);
  qs("#bookForm")?.addEventListener("submit", saveBook);
  qs("#orderForm")?.addEventListener("submit", updateOrder);
  qs("#inventoryForm")?.addEventListener("submit", adjustInventory);
  qs("#adminForm")?.addEventListener("submit", saveAdmin);
   qs("#publishSponsorBtn")?.addEventListener("click", publishCurrentSponsor);
  qs("#hideSponsorBtn")?.addEventListener("click", hideCurrentSponsor);
  qs("#sponsorsStatusFilter")?.addEventListener("change", function (event) {
    state.sponsorFilters.status = event.target.value || "";
    loadSponsors().catch(function (error) {
      setStatus("#sponsorStatus", error.message || "Sponsors could not be loaded.", false);
    });
  });
  qs("#sponsorsPackageFilter")?.addEventListener("change", function (event) {
    state.sponsorFilters.package = event.target.value || "";
    loadSponsors().catch(function (error) {
      setStatus("#sponsorStatus", error.message || "Sponsors could not be loaded.", false);
    });
  });
  qs("#authorForm")?.addEventListener("submit", saveAuthor);
  qs("#newAuthorBtn")?.addEventListener("click", resetAuthorForm);
  qs("#publishAuthorBtn")?.addEventListener("click", publishCurrentAuthor);
  qs("#hideAuthorBtn")?.addEventListener("click", hideCurrentAuthor);
  qs("#authorStatusFilter")?.addEventListener("change", function (event) {
    state.authorFilters.status = event.target.value || "";
    loadAuthors().catch(function (error) {
      setStatus("#authorStatus", error.message || "Authors could not be loaded.", false);
    });
  });
  qs("#authorPortrait")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#authorPortraitPreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });
  qs("#analyticsRangeFilter")?.addEventListener("change", function (event) {
    state.analyticsRangeDays = parseInt(event.target.value, 10) || 30;
    loadAnalytics().catch(function () {});
  });

  qs("#ordersSearch")?.addEventListener("input", function (event) {
    state.orderFilters.search = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersPaymentFilter")?.addEventListener("change", function (event) {
    state.orderFilters.payment = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersFulfillmentFilter")?.addEventListener("change", function (event) {
    state.orderFilters.fulfillment = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersSort")?.addEventListener("change", function (event) {
    state.orderFilters.sort = event.target.value || "date-desc";
    renderStoreOrders();
  });
  qs("#inventorySearch")?.addEventListener("input", function (event) {
    state.inventoryFilters.search = event.target.value || "";
    renderInventory();
  });
  qs("#inventoryStatusFilter")?.addEventListener("change", function (event) {
    state.inventoryFilters.status = event.target.value || "";
    renderInventory();
  });
  qs("#inventoryHealthFilter")?.addEventListener("change", function (event) {
    state.inventoryFilters.health = event.target.value || "";
    renderInventory();
  });
  qs("#inventorySort")?.addEventListener("change", function (event) {
    state.inventoryFilters.sort = event.target.value || "updated-desc";
    renderInventory();
  });
  qs("#draftsBtn")?.addEventListener("click", function () {
    openCampaignLibrary("drafts");
  });
  qs("#scheduledBtn")?.addEventListener("click", function () {
    openCampaignLibrary("scheduled");
  });
  qs("#newBtn")?.addEventListener("click", function () {
    fillNewsletterDefaults(state.newsletterDefaults);
    setStatus("#status", "", null);
    updateNewsletterPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  qs("#closeCampaignLibraryBtn")?.addEventListener("click", closeCampaignLibrary);
  qs("#saveBtn")?.addEventListener("click", saveNewsletterDraft);
  qs("#testBtn")?.addEventListener("click", sendNewsletterTest);
  qs("#scheduleBtn")?.addEventListener("click", scheduleNewsletter);
  qs("#desktopPreviewBtn")?.addEventListener("click", function () {
    qs("#emailWrap")?.classList.remove("mobile");
    qs("#desktopPreviewBtn")?.classList.add("active");
    qs("#mobilePreviewBtn")?.classList.remove("active");
    const pill = qs("#previewModePill");
    if (pill) pill.textContent = "Desktop";
    updateNewsletterStats(newsletterPayload(), newsletterSelectedBook());
  });
  qs("#mobilePreviewBtn")?.addEventListener("click", function () {
    qs("#emailWrap")?.classList.add("mobile");
    qs("#mobilePreviewBtn")?.classList.add("active");
    qs("#desktopPreviewBtn")?.classList.remove("active");
    const pill = qs("#previewModePill");
    if (pill) pill.textContent = "Mobile";
    updateNewsletterStats(newsletterPayload(), newsletterSelectedBook());
  });
  qs("#bookImage")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#imagePreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });
  qsa("#newsletterAdminRoot input,#newsletterAdminRoot textarea,#newsletterAdminRoot select").forEach(function (element) {
    element.addEventListener("input", updateNewsletterPreview);
    element.addEventListener("change", function () {
      if (element.id === "featuredBookId") {
        const book = newsletterSelectedBook();
        const description = qs("#featuredBookDescription");
        if (book && description && !description.value) description.value = book.shortDescription || "";
      }
      if (element.id === "targetType") {
        toggleNewsletterTargetField();
      }
      updateNewsletterPreview();
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeCampaignLibrary();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshCurrentPage);
  } else {
    refreshCurrentPage();
  }
})();