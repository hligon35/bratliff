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
    bookFilters: {
      search: "",
      status: "",
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

  const adminNavItems = [
    { key: "dashboard", href: "admin/index.html", label: "Dashboard", icon: "overview" },
    { key: "store", href: "admin/store.html", label: "Book Store", icon: "books" },
    { key: "newsletter", href: "admin/newsletter.html", label: "Newsletter", icon: "newsletter" },
    { key: "sponsors", href: "admin/sponsors.html", label: "Sponsors", icon: "contacts" },
    { key: "author", href: "admin/author.html", label: "Featured Author", icon: "featured-author" },
    { key: "analytics", href: "admin/analytics.html", label: "Analytics", icon: "analytics", roles: ["developer", "owner"] },
    { key: "activity", href: "admin/activity.html", label: "Activity Log", icon: "activity-log", roles: ["developer", "owner"] },
    { key: "profile", href: "admin/profile.html", label: "Access Management", icon: "access-management", roles: ["developer", "owner"] },
    { key: "settings", href: "admin/settings.html", label: "Settings", icon: "settings" },
  ];

  function renderAdminNavigation() {
    const nav = qs(".jrpp-admin-nav");
    if (!nav) return;
    const role = state.viewer && state.viewer.role ? state.viewer.role : "";
    nav.innerHTML = adminNavItems
      .filter(function (item) { return !item.roles || item.roles.indexOf(role) >= 0; })
      .map(function (item) {
        const active = item.key === state.page;
        return '<a class="' + (active ? "active" : "") + '" href="' + item.href + '" data-admin-nav="' + item.key + '" data-icon="' + item.icon + '" title="' + escapeHtml(item.label) + '"' + (active ? ' aria-current="page"' : "") + '>' + escapeHtml(item.label) + "</a>";
      })
      .join("");
  }

  function initAdminDrawer() {
    const drawer = qs(".jrpp-admin-switcher");
    if (!drawer) return;
    let toggle = drawer.querySelector("[data-admin-drawer-toggle]");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "jrpp-admin-drawer-toggle";
      toggle.setAttribute("data-admin-drawer-toggle", "");
      toggle.setAttribute("aria-label", "Collapse admin navigation");
      toggle.innerHTML = "<span aria-hidden=\"true\">☰</span><span class=\"drawer-toggle-label\">Collapse menu</span>";
      drawer.insertBefore(toggle, drawer.firstChild);
    }
    // Class is already applied to <html> by the inline head script; mirror it on <body>
    // without touching the DOM if it's already collapsed, so no layout shift occurs here.
    const collapsed = document.documentElement.classList.contains("admin-drawer-collapsed");
    if (collapsed && !document.body.classList.contains("admin-drawer-collapsed")) {
      document.body.classList.add("admin-drawer-collapsed");
    }
    const syncToggleLabel = function (isCollapsed) {
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      const navigationLabel = isCollapsed ? "Expand admin navigation" : "Collapse admin navigation";
      toggle.setAttribute("aria-label", navigationLabel);
      toggle.setAttribute("title", navigationLabel);
      const label = toggle.querySelector(".drawer-toggle-label");
      if (label) label.textContent = isCollapsed ? "Expand menu" : "Collapse menu";
    };
    const update = function () {
      const isCollapsed = document.body.classList.toggle("admin-drawer-collapsed");
      document.documentElement.classList.toggle("admin-drawer-collapsed", isCollapsed);
      syncToggleLabel(isCollapsed);
      try { window.localStorage.setItem("jrpp-admin-drawer-collapsed", isCollapsed ? "1" : "0"); } catch {}
    };
    syncToggleLabel(collapsed);
    toggle.addEventListener("click", update);
    renderAdminNavigation();
  }

  function initStoreActionRow() {
    if (state.page !== "store") return;
    const tools = qs("[data-store-tools]");
    const setupButton = qs("#setupBtn");
    const refreshButton = qs("#globalRefreshBtn");
    if (!tools) return;
    if (setupButton && setupButton.parentElement !== tools) tools.appendChild(setupButton);
    if (refreshButton && refreshButton.parentElement !== tools) tools.appendChild(refreshButton);
  }

  function resolveApiRoot(configuredValue, defaultPath) {
    if (publicApiRoot) return publicApiRoot + defaultPath;
    return String(configuredValue || "").replace(/\/$/, "");
  }


  const adminButtonIcons = Object.freeze({
    "refresh": "sync-square-stock",
    "sign out": "sign-ins-outs",
    "overview": "overview",
    "books": "books",
    "orders": "orders",
    "inventory": "inventory",
    "initialize / repair store": "initialize-repair",
    "sync square stock": "sync-square-stock",
    "add book": "add-book",
    "+ add book": "add-book",
    "save book": "save-book",
    "cancel": "cancel",
    "duplicate": "duplicate",
    "edit": "edit",
    "publish": "publish",
    "archive": "archive",
    "remove image": "remove",
    "save fulfillment": "save-fulfillment",
    "apply adjustment": "apply-adjustment",
    "publish sponsor": "publish",
    "hide sponsor": "hide",
    "new author": "new-author",
    "save author": "save-author",
    "publish to media page": "publish-media",
    "unpublish": "unpublish",
    "drafts": "drafts",
    "scheduled": "scheduled",
    "new newsletter": "new-newsletter",
    "save draft": "save-draft",
    "save settings": "save-book",
    "send test": "send-test",
    "schedule / send": "schedule-send",
    "desktop preview": "desktop-preview",
    "mobile preview": "mobile-preview",
    "open": "open",
    "close": "close",
    "view": "view",
    "delete": "delete",
    "hide": "hide",
    "all activity": "all-activity",
    "sign-ins & outs": "sign-ins-outs",
    "newsletter saves": "newsletter-saves",
    "newsletter sends": "send-test",
    "export to sheets": "export-sheets",
    "save admin": "save-admin",
    "settings": "settings",
  });

  const adminMaterialIconMap = Object.freeze({
    "refresh": "refresh",
    "sync-square-stock": "sync",
    "sign-ins-outs": "logout",
    "overview": "dashboard",
    "books": "menu_book",
    "orders": "receipt_long",
    "inventory": "inventory_2",
    "initialize-repair": "build",
    "add-book": "add_circle",
    "save-book": "save",
    "cancel": "cancel",
    "duplicate": "content_copy",
    "edit": "edit",
    "publish": "publish",
    "archive": "archive",
    "remove": "remove_circle",
    "save-fulfillment": "local_shipping",
    "apply-adjustment": "tune",
    "hide": "visibility_off",
    "new-author": "person_add",
    "save-author": "save",
    "publish-media": "publish",
    "unpublish": "unpublished",
    "drafts": "drafts",
    "scheduled": "event",
    "new-newsletter": "post_add",
    "save-draft": "save",
    "send-test": "send",
    "schedule-send": "schedule_send",
    "desktop-preview": "desktop_windows",
    "mobile-preview": "phone_iphone",
    "open": "open_in_new",
    "close": "close",
    "view": "visibility",
    "delete": "delete",
    "all-activity": "list_alt",
    "export-sheets": "file_download",
    "save-admin": "save",
    "settings": "settings",
    "menu": "menu",
    "newsletter": "mail",
    "contacts": "contacts",
    "featured-author": "person",
    "analytics": "analytics",
    "activity-log": "history",
    "access-management": "manage_accounts",
    "newsletter-saves": "save",
  });

  function createAdminIcon(name) {
    if (!name) return null;
    const icon = document.createElement("span");
    icon.classList.add("jrpp-icon", "material-icons-round");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.textContent = adminMaterialIconMap[name] || name.replace(/-/g, "_");
    return icon;
  }

  function initAdminIcons() {
    qsa("[data-icon], button, .btn, .jrpp-admin-action").forEach(function (element) {
      const isControl = (element.tagName && element.tagName.toLowerCase() === "button") || element.matches(".settings-avatar-button");
      const explicit = element.getAttribute("data-icon");
      const existingAriaLabel = element.getAttribute("aria-label") || "";
      const visibleLabel = String(element.textContent || "").replace(/\s+/g, " ").trim();
      const label = (existingAriaLabel || visibleLabel).toLowerCase();
      const iconName = explicit
        || (element.matches("[data-admin-drawer-toggle]") ? "menu" : adminButtonIcons[label]);

      if (!element.querySelector(".jrpp-icon") && iconName) {
        const icon = createAdminIcon(iconName);
        if (icon) {
          element.prepend(icon);
          element.classList.add("has-jrpp-icon");
        }
      }

      if (isControl) {
        const accessibleLabel = existingAriaLabel || visibleLabel;
        if (accessibleLabel && !element.getAttribute("aria-label")) {
          element.setAttribute("aria-label", accessibleLabel);
        }
        if (accessibleLabel && !element.getAttribute("title")) {
          element.setAttribute("title", accessibleLabel);
        }
        element.classList.add("admin-icon-only");
      }
    });
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
          const heading = column.header ? column.header() : escapeHtml(column.label || "");
          return "<th>" + heading + "</th>";
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

  function bulkSelectionColumn(kind, getId, getLabel, pluralLabel) {
    return {
      label: "",
      header: function () {
        return '<input class="bulk-select-all" type="checkbox" data-bulk-select-all="' + escapeHtml(kind) + '" aria-label="Select all ' + escapeHtml(pluralLabel) + '">';
      },
      render: function (row) {
        const id = String(getId(row) || "");
        const label = String(getLabel(row) || id);
        return '<input class="bulk-row-select" type="checkbox" data-bulk-select="' + escapeHtml(kind) + '" data-bulk-id="' + escapeHtml(id) + '" aria-label="Select ' + escapeHtml(label) + '">';
      },
    };
  }

  function bulkActionBar(kind, pluralLabel, canDelete) {
    if (!canDelete) return "";
    return '<div class="bulk-action-bar" data-bulk-toolbar="' + escapeHtml(kind) + '" hidden>' +
      '<span data-bulk-count="' + escapeHtml(kind) + '">0 selected</span>' +
      '<button class="btn warn icon-only bulk-delete-button" type="button" data-bulk-delete="' + escapeHtml(kind) + '" data-icon="delete" aria-label="Delete selected ' + escapeHtml(pluralLabel) + '" title="Delete selected ' + escapeHtml(pluralLabel) + '"></button>' +
      "</div>";
  }

  function selectableTableMarkup(kind, columns, rows, emptyMessage, getId, getLabel, pluralLabel, canDelete) {
    if (!canDelete) return tableMarkup("table", columns, rows, emptyMessage);
    const selection = bulkSelectionColumn(kind, getId, getLabel, pluralLabel);
    return bulkActionBar(kind, pluralLabel, true) +
      tableMarkup("table bulk-select-table", [selection].concat(columns), rows, emptyMessage);
  }

  function selectedBulkIds(kind) {
    return qsa('[data-bulk-select="' + kind + '"]:checked')
      .map(function (input) { return input.getAttribute("data-bulk-id") || ""; })
      .filter(Boolean);
  }

  function syncBulkSelection(kind) {
    const boxes = qsa('[data-bulk-select="' + kind + '"]');
    const selected = boxes.filter(function (box) { return box.checked; });
    const toolbar = qs('[data-bulk-toolbar="' + kind + '"]');
    const count = toolbar ? toolbar.querySelector('[data-bulk-count="' + kind + '"]') : null;
    if (toolbar) toolbar.hidden = selected.length === 0;
    if (count) count.textContent = selected.length + " selected";
    const master = qs('[data-bulk-select-all="' + kind + '"]');
    if (master) {
      master.checked = boxes.length > 0 && selected.length === boxes.length;
      master.indeterminate = selected.length > 0 && selected.length < boxes.length;
    }
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
    renderAdminNavigation();
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
    const openSections = new Set(
      qsa(".dashboard-detail[data-dashboard-section]")
        .filter(function (detail) { return detail.open; })
        .map(function (detail) { return detail.getAttribute("data-dashboard-section"); }),
    );
    root.innerHTML = dashboardForms
      .map(function (section) {
        const count = dashboardFormCount(section.key);
        const visibleCount = dashboardRowsLoaded(section.key) ? Math.min((state.dashboardRows[section.key] || []).length, 10) : 10;
        const openAttribute = openSections.has(section.key) ? " open" : "";
        return (
          '<details class="dashboard-detail" data-dashboard-section="' + escapeHtml(section.key) + '"' + openAttribute + '>' +
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
    const form = qs("#adminForm");
    const canDelete = Boolean(state.viewer && state.viewer.role === "owner");
    if (form) form.hidden = !canDelete;
    const addButton = qs("#openAdminFormBtn");
    if (addButton) addButton.hidden = !canDelete;
    const root = qs("#adminList");
    if (!root) return;
    root.innerHTML = selectableTableMarkup(
      "admins",
      [
        { label: "Name", render: function (row) { return escapeHtml(row.name || row.displayName || "—"); } },
        { label: "Email", key: "email" },
        { label: "Role", render: function (row) { return '<span class="badge">' + escapeHtml(row.role || "") + "</span>"; } },
        { label: "Display Name", key: "displayName" },
        { label: "Access", render: function (row) {
          const access = {
            owner: "Full admin access; manages permissions",
            developer: "Admin tools, analytics and logs; cannot change permissions",
            manager: "Admin tools; no analytics, logs or access management",
          };
          return escapeHtml(access[row.role] || "Unknown role");
        } },
        {
          label: "Actions",
          render: function (row) {
            return canDelete
              ? '<button class="btn alt icon-only" type="button" data-remove-admin="' + escapeHtml(row.email) + '" data-icon="delete" aria-label="Remove admin access for ' + escapeHtml(row.email) + '" title="Remove admin access for ' + escapeHtml(row.email) + '"></button>'
              : '<span class="asset-note" title="Only owners can change admin access" aria-label="Only owners can change admin access">—</span>';
          },
        },
      ],
      state.admins,
      "No admin users found.",
      function (row) { return row.email; },
      function (row) { return row.email; },
      "admins",
      canDelete,
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

  function filteredBooks() {
    const search = state.bookFilters.search.trim().toLowerCase();
    const status = state.bookFilters.status.toLowerCase();
    const rows = state.books.filter(function (book) {
      if (status && String(book.status || "").toLowerCase() !== status) return false;
      return includesNeedle([book.title, book.sku, book.author, book.category], search);
    });
    rows.sort(function (left, right) {
      switch (state.bookFilters.sort) {
        case "title-asc":
          return String(left.title || "").localeCompare(String(right.title || ""));
        case "stock-asc":
          return Number(left.stock || 0) - Number(right.stock || 0);
        case "price-asc":
          return Number(left.price || 0) - Number(right.price || 0);
        case "price-desc":
          return Number(right.price || 0) - Number(left.price || 0);
        case "updated-desc":
        default:
          return asTime(right.updatedAt) - asTime(left.updatedAt);
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
    const rows = filteredBooks();
    root.innerHTML = selectableTableMarkup(
      "books",
      [
        { label: "Cover", render: function (book) { return book.imageUrl ? '<img class="cover" src="' + escapeHtml(book.imageUrl) + '" alt="">' : ""; } },
        { label: "Title", render: function (book) { return "<b>" + escapeHtml(book.title || "") + "</b><br><small>" + escapeHtml(book.author || "") + "</small>"; } },
        { label: "SKU", key: "sku" },
        { label: "Price", render: function (book) { return escapeHtml(formatMoney(book.price)); } },
        { label: "Stock", key: "stock" },
        { label: "Status", render: function (book) { return '<span class="badge">' + escapeHtml(book.status || "") + "</span>"; } },
        {
          label: "",
          render: function (book) {
            return '<span class="table-action-buttons book-table-actions">' +
              '<button class="btn alt" type="button" data-edit-book="' + escapeHtml(book.bookId) + '">Edit</button>' +
              '<button class="btn alt" type="button" data-duplicate-book="' + escapeHtml(book.bookId) + '">Duplicate</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-book="' + escapeHtml(book.bookId) + '" data-icon="delete" aria-label="Remove ' + escapeHtml(book.title || "book") + '" title="Remove ' + escapeHtml(book.title || "book") + '"></button>' +
              '</span>';
          },
        },
      ],
      rows,
      "No books match the current filters.",
      function (book) { return book.bookId; },
      function (book) { return book.title || book.bookId; },
      "books",
      true,
    );
    const summary = qs("#bookFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.books.length + " books shown";
    renderInventory();
    renderStoreMetrics();
  }

  function resetBookForm() {
    const form = qs("#bookForm");
    if (!form) return;
    form.reset();
    const bookIdField = field(form, "bookId");
    const thresholdField = field(form, "lowStockThreshold");
    const fileInput = qs("#bookImage");
    if (bookIdField) bookIdField.value = "";
    if (thresholdField) thresholdField.value = 5;
    if (fileInput) fileInput.value = "";
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
    if (!window.confirm("Remove " + (book ? '"' + book.title + '"' : "this book") + "? Books with order or inventory history will be archived instead of permanently deleted.")) return;
    try {
      const result = await api("books/" + encodeURIComponent(bookId), { method: "DELETE" });
      if (safeValue(field(qs("#bookForm"), "bookId")) === bookId) resetBookForm();
      await loadBooks();
      setStatus("#bookStatus", result.message || "Book removed.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be removed.", false);
    }
  }

  async function duplicateBookRow(bookId) {
    const source = state.books.find(function (entry) {
      return entry.bookId === bookId;
    });
    if (!source) return;
    const suffix = "-COPY-" + String(Date.now()).slice(-4);
    const payload = {
      sku: String(source.sku || "BOOK").slice(0, 100 - suffix.length) + suffix,
      isbn: source.isbn || "",
      title: String(source.title || "Untitled Book") + " Copy",
      subtitle: source.subtitle || "",
      author: source.author || "",
      category: source.category || "",
      format: source.format || "Paperback",
      publicationDate: source.publicationDate || "",
      price: source.price || 0,
      comparePrice: source.comparePrice || 0,
      stock: 0,
      lowStockThreshold: source.lowStockThreshold || 5,
      shortDescription: source.shortDescription || "",
      synopsis: source.synopsis || "",
      status: "Draft",
      featured: false,
      comingSoon: false,
      preorder: false,
      squareCatalogItemId: "",
      squareCatalogVariationId: "",
    };
    try {
      setStatus("#bookStatus", "Duplicating...", null);
      const data = await api("books", { method: "POST", body: payload });
      await loadBooks();
      const duplicate = state.books.find(function (entry) {
        return entry.bookId === (data.book && data.book.bookId);
      });
      if (duplicate) populateBookForm(duplicate);
      setStatus("#bookStatus", "Book duplicated as a draft. Review the SKU and details before publishing.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be duplicated.", false);
    }
  }

  async function removeCurrentBookImage() {
    const form = qs("#bookForm");
    const fileInput = qs("#bookImage");
    const bookId = safeValue(field(form, "bookId"));
    const current = state.books.find(function (entry) { return entry.bookId === bookId; });
    if (fileInput) fileInput.value = "";
    if (!bookId) {
      const preview = qs("#imagePreview");
      if (preview) preview.innerHTML = "<span>No image</span>";
      return;
    }
    if (!current || !current.imageUrl) return;
    if (!window.confirm("Remove this book image?")) return;
    try {
      setStatus("#bookStatus", "Removing image...", null);
      await api("books/" + encodeURIComponent(bookId) + "/image", { method: "DELETE" });
      await loadBooks();
      populateBookForm(state.books.find(function (entry) { return entry.bookId === bookId; }));
      setStatus("#bookStatus", "Image removed.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Image could not be removed.", false);
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
    const fileInput = qs("#bookImage");
    if (fileInput) fileInput.value = "";
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
      qs("#adminFormDialog")?.close();
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

  function sponsorAvatarMarkup(row) {
    const label = row.anonymous ? "Anonymous" : (row.displayName || row.payerName || row.id || "Sponsor");
    const initials = label.split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
    if (!row.anonymous && row.logoUrl) {
      return '<span class="sponsor-avatar"><img src="' + escapeHtml(row.logoUrl) + '" alt=""></span>';
    }
    return '<span class="sponsor-avatar sponsor-avatar-fallback" aria-hidden="true">' + escapeHtml(row.anonymous ? "A" : initials) + "</span>";
  }

  function renderSponsorList() {
    const packageLabels = {
      pagePal: "Page Pal",
      chapterChampion: "Chapter Champion",
      bookshelfBuilder: "Bookshelf Builder",
      literacyTrailblazer: "Literacy Trailblazer",
    };
    const markup = selectableTableMarkup(
      "sponsors",
      [
        { label: "Sponsor", render: function (row) { return sponsorAvatarMarkup(row) + '<span class="sponsor-list-name">' + escapeHtml(row.anonymous ? "Anonymous" : (row.displayName || row.payerName || row.id)) + "</span>"; } },
        { label: "Package", render: function (row) { return escapeHtml(packageLabels[row.package] || row.package); } },
        { label: "Books", key: "booksSponsored" },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.recognitionStatus) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            const label = row.anonymous ? "Anonymous sponsor" : (row.displayName || row.payerName || row.id);
            return '<span class="table-action-buttons">' +
              '<button class="btn alt" type="button" data-edit-sponsor="' + escapeHtml(row.id) + '">View</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-sponsor="' + escapeHtml(row.id) + '" data-icon="delete" aria-label="Delete ' + escapeHtml(label) + '" title="Delete ' + escapeHtml(label) + '"></button>' +
              '</span>';
          },
        },
      ],
      state.sponsors,
      "No sponsors match these filters.",
      function (row) { return row.id; },
      function (row) { return row.anonymous ? "Anonymous sponsor" : (row.displayName || row.payerName || row.id); },
      "sponsors",
      true,
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
    const markup = selectableTableMarkup(
      "authors",
      [
        { label: "Author", render: function (row) { return escapeHtml(row.name || row.id); } },
        { label: "Title", render: function (row) { return escapeHtml(row.title || "—"); } },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.status) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            const label = row.name || row.id;
            return '<span class="table-action-buttons">' +
              '<button class="btn alt" type="button" data-edit-author="' + escapeHtml(row.id) + '">Edit</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-author="' + escapeHtml(row.id) + '" data-icon="delete" aria-label="Delete ' + escapeHtml(label) + '" title="Delete ' + escapeHtml(label) + '"></button>' +
              '</span>';
          },
        },
      ],
      state.authors,
      "No authors yet. Create one below.",
      function (row) { return row.id; },
      function (row) { return row.name || row.id; },
      "authors",
      true,
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
    const portraitPreview = qs("#authorPortraitPreview");
    if (portraitPreview) portraitPreview.innerHTML = "<span>No author image</span>";
    const bookPreview = qs("#authorBookImagePreview");
    if (bookPreview) bookPreview.innerHTML = "<span>No book image</span>";
    setStatus("#authorStatus", "", null);
  }

  async function deleteAuthorRow(authorId) {
    const author = state.authors.find(function (entry) { return entry.id === authorId; });
    const label = author ? author.name || authorId : "this author";
    if (!window.confirm("Delete " + label + "? This can't be undone.")) return;
    try {
      await api("authors/" + encodeURIComponent(authorId), { method: "DELETE" });
      const form = qs("#authorForm");
      if (form && safeValue(field(form, "authorId")) === authorId) resetAuthorForm();
      await loadAuthors();
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be deleted.", false);
    }
  }

  async function deleteSelectedRows(kind) {
    const ids = selectedBulkIds(kind);
    if (!ids.length) return;
    const configs = {
      books: {
        singular: "book",
        plural: "books",
        endpoint: function (id) { return "books/" + encodeURIComponent(id); },
        load: loadBooks,
        status: "#bookStatus",
        note: "Books with order or inventory history will be archived instead of permanently deleted.",
      },
      sponsors: {
        singular: "sponsor",
        plural: "sponsors",
        endpoint: function (id) { return "sponsors/" + encodeURIComponent(id); },
        load: loadSponsors,
        status: "#sponsorStatus",
        note: "This cannot be undone.",
      },
      authors: {
        singular: "author",
        plural: "authors",
        endpoint: function (id) { return "authors/" + encodeURIComponent(id); },
        load: loadAuthors,
        status: "#authorStatus",
        note: "This cannot be undone.",
      },
      admins: {
        singular: "admin account",
        plural: "admin accounts",
        endpoint: function (id) { return "admins/" + encodeURIComponent(id); },
        load: loadAdmins,
        status: "#adminStatus",
        note: "This cannot be undone.",
      },
    };
    const config = configs[kind];
    if (!config) return;
    const itemLabel = ids.length === 1 ? config.singular : config.plural;
    if (!window.confirm("Delete " + ids.length + " selected " + itemLabel + "? " + config.note)) return;
    let completed = 0;
    const errors = [];
    for (const id of ids) {
      try {
        await api(config.endpoint(id), { method: "DELETE" });
        completed += 1;
      } catch (error) {
        errors.push(error.message || "Delete failed");
      }
    }
    await config.load();
    setStatus(
      config.status,
      errors.length
        ? completed + " of " + ids.length + " selected " + itemLabel + " processed. " + errors.length + " failed."
        : completed + " selected " + itemLabel + " deleted.",
      errors.length ? completed > 0 : true,
    );
  }

  function populateAuthorForm(author) {
    const form = qs("#authorForm");
    if (!form || !author) return;
    [["authorId", "id"], ["name", "name"], ["title", "title"], ["biography", "biography"], ["websiteUrl", "websiteUrl"], ["startAt", "startAt"], ["endAt", "endAt"]].forEach(function (pair) {
      const control = field(form, pair[0]);
      if (control) control.value = author[pair[1]] == null ? "" : author[pair[1]];
    });
    let links = {};
    try {
      const parsed = JSON.parse(author.socialLinks || "{}");
      if (Array.isArray(parsed)) {
        parsed.forEach(function (url) {
          const value = String(url || "");
          const key = /instagram/i.test(value) ? "instagram" : /linkedin/i.test(value) ? "linkedin" : /tiktok/i.test(value) ? "tiktok" : /youtube/i.test(value) ? "youtube" : "facebook";
          if (!links[key]) links[key] = value;
        });
      } else if (parsed && typeof parsed === "object") {
        links = parsed;
      }
    } catch {}
    [["facebook", "authorFacebook"], ["instagram", "authorInstagram"], ["linkedin", "authorLinkedIn"], ["tiktok", "authorTikTok"], ["youtube", "authorYouTube"]].forEach(function (pair) {
      const control = qs("#" + pair[1]);
      if (control) control.value = links[pair[0]] || "";
    });
    const title = qs("#authorFormTitle");
    if (title) title.textContent = "Edit Author";
    const portraitPreview = qs("#authorPortraitPreview");
    if (portraitPreview) portraitPreview.innerHTML = author.portraitUrl ? '<img src="' + escapeHtml(author.portraitUrl) + '" alt="">' : "<span>No author image</span>";
    const bookPreview = qs("#authorBookImagePreview");
    if (bookPreview) bookPreview.innerHTML = author.bookImageUrl ? '<img src="' + escapeHtml(author.bookImageUrl) + '" alt="">' : "<span>No book image</span>";
    const statusPill = qs("#authorStatusPill");
    if (statusPill) statusPill.textContent = author.status || "Draft";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function authorPayload() {
    const form = qs("#authorForm");
    if (!form) return {};
    const payload = {};
    [["authorId", "authorId"], ["name", "name"], ["title", "title"], ["biography", "biography"], ["websiteUrl", "websiteUrl"], ["startAt", "startAt"], ["endAt", "endAt"]].forEach(function (pair) {
      payload[pair[0]] = safeValue(field(form, pair[1]));
    });
    payload.socialLinks = JSON.stringify({
      facebook: safeValue(qs("#authorFacebook")),
      instagram: safeValue(qs("#authorInstagram")),
      linkedin: safeValue(qs("#authorLinkedIn")),
      tiktok: safeValue(qs("#authorTikTok")),
      youtube: safeValue(qs("#authorYouTube")),
    });
    return payload;
  }

  async function saveAuthor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setStatus("#authorStatus", "Saving...", null);
    try {
      const data = await api("authors", { method: "POST", body: authorPayload() });
      let author = data.author;
      const portraitInput = qs("#authorPortrait");
      const bookInput = qs("#authorBookImage");
      const portraitFile = portraitInput && portraitInput.files ? portraitInput.files[0] : null;
      const bookFile = bookInput && bookInput.files ? bookInput.files[0] : null;
      if (author && author.id && portraitFile) {
        const upload = new FormData();
        upload.set("file", portraitFile);
        await api("authors/" + encodeURIComponent(author.id) + "/portrait", { method: "POST", body: upload });
      }
      if (author && author.id && bookFile) {
        const upload = new FormData();
        upload.set("file", bookFile);
        await api("authors/" + encodeURIComponent(author.id) + "/book-image", { method: "POST", body: upload });
      }
      await loadAuthors();
      author = state.authors.find(function (entry) { return entry.id === (author && author.id); }) || author;
      if (author) populateAuthorForm(author);
      if (portraitInput) portraitInput.value = "";
      if (bookInput) bookInput.value = "";
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
        '<div class="metric"><strong>' + escapeHtml(formatMoney(data.totalSponsorRevenue || 0)) + '</strong><span>Sponsorship Revenue</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(formatMoney(data.bookRevenue || 0)) + '</strong><span>Book Revenue</span></div>';
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

  async function loadSettings() {
    const data = await api("me");
    state.viewer = data.viewer || state.viewer;
    const form = qs("#settingsForm");
    if (form && state.viewer) {
      const displayName = field(form, "displayName");
      const name = field(form, "name");
      const email = field(form, "email");
      if (displayName) displayName.value = state.viewer.displayName || "";
      if (name) name.value = state.viewer.name || state.viewer.displayName || "";
      if (email) email.value = state.viewer.email || "";
    }
    const preview = qs("#settingsAvatarPreview");
    if (preview) preview.innerHTML = state.viewer && state.viewer.avatarUrl
      ? '<img src="' + escapeHtml(state.viewer.avatarUrl) + '" alt="">'
      : "<span>No avatar</span>";
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setStatus("#settingsStatus", "Saving...", null);
    try {
      const data = await api("me", {
        method: "PUT",
        body: {
          displayName: safeValue(field(form, "displayName")),
          name: safeValue(field(form, "name")),
          email: safeValue(field(form, "email")),
        },
      });
      state.viewer = data.viewer || state.viewer;
      const fileInput = qs("#settingsAvatar");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (file) {
        const upload = new FormData();
        upload.set("file", file);
        const avatar = await api("me/avatar", { method: "POST", body: upload });
        state.viewer = avatar.viewer || state.viewer;
        fileInput.value = "";
      }
      writeCache(cacheKeys.viewer, state.viewer);
      renderViewer();
      await loadSettings();
      setStatus("#settingsStatus", "Settings saved.", true);
    } catch (error) {
      setStatus("#settingsStatus", error.message || "Settings could not be saved.", false);
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
      } else if (state.page === "activity") {
        await loadActivity({ force: force });
      } else if (state.page === "settings") {
        await loadSettings();
      }
      renderViewer();
      initAdminIcons();
    } catch (error) {
      const dashboardEmail = qs("#dashboardViewerEmail");
      if (dashboardEmail) dashboardEmail.textContent = error.message || "Could not load the admin console.";
      setStatus("#bookStatus", error.message || "Could not load the admin console.", false);
      setStatus("#adminStatus", error.message || "Could not load the admin console.", false);
      setStatus("#status", error.message || "Could not load the admin console.", false);
    }
  }

  document.addEventListener("change", function (event) {
    const master = event.target.closest("[data-bulk-select-all]");
    if (master) {
      const kind = master.getAttribute("data-bulk-select-all") || "";
      qsa('[data-bulk-select="' + kind + '"]').forEach(function (checkbox) {
        checkbox.checked = master.checked;
      });
      syncBulkSelection(kind);
      return;
    }
    const checkbox = event.target.closest("[data-bulk-select]");
    if (checkbox) syncBulkSelection(checkbox.getAttribute("data-bulk-select") || "");
  });

  document.addEventListener("click", function (event) {
    const bulkDeleteButton = event.target.closest("[data-bulk-delete]");
    if (bulkDeleteButton) {
      deleteSelectedRows(bulkDeleteButton.getAttribute("data-bulk-delete") || "");
      return;
    }


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

    const duplicateBookButton = event.target.closest("[data-duplicate-book]");
    if (duplicateBookButton) {
      duplicateBookRow(duplicateBookButton.getAttribute("data-duplicate-book"));
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
  qs("#cancelBookBtn")?.addEventListener("click", resetBookForm);
  qs("#duplicateBookBtn")?.addEventListener("click", function () {
    const bookId = safeValue(field(qs("#bookForm"), "bookId"));
    if (bookId) duplicateBookRow(bookId);
    else window.alert("Save the book first.");
  });
  qs("#removeBookImageBtn")?.addEventListener("click", removeCurrentBookImage);
  qs("#publishBtn")?.addEventListener("click", publishCurrentBook);
  qs("#archiveBtn")?.addEventListener("click", archiveCurrentBook);
  qs("#bookForm")?.addEventListener("submit", saveBook);
  qs("#orderForm")?.addEventListener("submit", updateOrder);
  qs("#inventoryForm")?.addEventListener("submit", adjustInventory);
  qs("#openAdminFormBtn")?.addEventListener("click", function () {
    if (!state.viewer || state.viewer.role !== "owner") return;
    qs("#adminFormDialog")?.showModal();
  });
  qs("#closeAdminFormBtn")?.addEventListener("click", function () { qs("#adminFormDialog")?.close(); });
  qs("#adminFormDialog")?.addEventListener("click", function (event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  qs("#adminForm")?.addEventListener("submit", saveAdmin);
  qs("#settingsForm")?.addEventListener("submit", saveSettings);
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
  qs("#authorBookImage")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#authorBookImagePreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });
  qs("#settingsAvatar")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#settingsAvatarPreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
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
  qs("#bookSearch")?.addEventListener("input", function (event) {
    state.bookFilters.search = event.target.value || "";
    renderBooks();
  });
  qs("#bookStatusFilter")?.addEventListener("change", function (event) {
    state.bookFilters.status = event.target.value || "";
    renderBooks();
  });
  qs("#bookSort")?.addEventListener("change", function (event) {
    state.bookFilters.sort = event.target.value || "updated-desc";
    renderBooks();
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

  initAdminDrawer();
  initStoreActionRow();
  initAdminIcons();

  if (window.MutationObserver && document.body) {
    const adminIconObserver = new MutationObserver(function () {
      initAdminIcons();
    });
    adminIconObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshCurrentPage);
  } else {
    refreshCurrentPage();
  }
})();