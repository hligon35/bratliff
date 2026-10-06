(function () {
  "use strict";

  const page = document.body.dataset.adminPage || "orders";
  const groups = [
    { label: "Bookstore", items: [
      { key: "orders", label: "Orders", icon: "receipt_long", view: true, count: "orderNavCount" },
      { key: "catalog", label: "Catalog", icon: "menu_book", view: true },
      { key: "inventory", label: "Inventory", icon: "inventory_2", view: true },
      { key: "store", label: "Store manager", icon: "storefront" },
    ] },
    { label: "Customer work", items: [
      { key: "mailbox", label: "Mailbox", icon: "mail", view: true, count: "mailNavCount" },
      { key: "submissions", label: "Website submissions", icon: "assignment", view: true },
    ] },
    { label: "Publishing", items: [
      { key: "author", label: "Featured Author", icon: "person" },
      { key: "sponsors", label: "Sponsors", icon: "volunteer_activism" },
      { key: "newsletter", label: "Newsletter", icon: "campaign" },
    ] },
    { label: "Administration", items: [
      { key: "analytics", label: "Analytics", icon: "analytics", restricted: true },
      { key: "activity", label: "Activity log", icon: "history", restricted: true },
      { key: "profile", label: "Admin access", icon: "admin_panel_settings", restricted: true },
      { key: "settings", label: "Settings", icon: "settings" },
    ] },
  ];
  const titles = {
    orders: ["BOOKSTORE OPERATIONS", "Orders"],
    catalog: ["BOOKSTORE", "Catalog"],
    inventory: ["BOOKSTORE", "Inventory"],
    mailbox: ["CUSTOMER WORK", "Mailbox"],
    submissions: ["CUSTOMER WORK", "Website submissions"],
    author: ["PUBLISHING", "Featured Author"],
    sponsors: ["PUBLISHING", "Sponsors"],
    newsletter: ["PUBLISHING", "Newsletter"],
    analytics: ["ADMINISTRATION", "Analytics"],
    activity: ["ADMINISTRATION", "Activity log"],
    profile: ["ADMINISTRATION", "Admin access"],
    settings: ["ADMINISTRATION", "Settings"],
    store: ["BOOKSTORE", "Store manager"],
  };
  const drawer = document.querySelector("[data-admin-shell-drawer]");
  const header = document.querySelector("[data-admin-shell-header]");
  if (!drawer || !header) throw new Error("The admin page is missing its workspace shell.");

  function icon(name, className) {
    const extraClass = className ? className + " " : "";
    // Material Icons Round assignment: the local font subset omits this glyph.
    // Source: google/material-design-icons, src/action/assignment/materialiconsround/24px.svg (Apache-2.0).
    if (name === "assignment") {
      return '<svg class="' + extraClass + 'shell-svg-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm1 14H8c-.55 0-1-.45-1-1s.45-1 1-1h5c.55 0 1 .45 1 1s-.45 1-1 1zm3-4H8c-.55 0-1-.45-1-1s.45-1 1-1h8c.55 0 1 .45 1 1s-.45 1-1 1zm0-4H8c-.55 0-1-.45-1-1s.45-1 1-1h8c.55 0 1 .45 1 1s-.45 1-1 1z"/></svg>';
    }
    return '<span class="' + extraClass + 'material-icons-round" aria-hidden="true">' + name + "</span>";
  }

  drawer.innerHTML =
    '<div class="drawer-toolbar"><button class="icon-button drawer-close" type="button" data-drawer-toggle aria-controls="workspaceDrawer">' + icon("menu") + '</button></div><div class="brand-row"><a class="workspace-brand" href="/admin/" aria-label="Publisher workspace">' +
    '<img src="/assets/icons/jrppLogo2.png" alt="" width="42" height="42">' +
    '<span class="brand-name">Jackrabbit Punkin<small>Publisher workspace</small></span></a></div>' +
    groups.map(function (group) {
      return '<div class="nav-label">' + group.label.toUpperCase() + '</div><nav class="primary-nav" aria-label="' + group.label + '">' +
        group.items.map(function (item) {
          const href = item.view ? "/admin/index.html?view=" + item.key : "/admin/" + item.key + ".html";
          return '<a class="nav-item" href="' + href + '" data-shell-page="' + item.key + '" title="' + item.label + '" aria-label="' + item.label + '"' +
            (item.view && !document.body.dataset.adminPage ? ' data-view="' + item.key + '"' : "") +
            (item.restricted ? " data-shell-restricted hidden" : "") + '>' + icon(item.icon, "nav-icon") +
            "<span>" + item.label + "</span>" + (item.count ? '<span class="nav-count" id="' + item.count + '"></span>' : "") + "</a>";
        }).join("") + "</nav>";
    }).join("") +
    '<div class="drawer-bottom">' +
    '<div class="account-row"><span class="avatar" id="viewerInitials">J</span><span class="account-copy"><b id="viewerName">Loading account</b>' +
    '<small id="viewerEmail">Checking secure session...</small></span></div><button type="button" class="signout" id="signOutBtn" title="Sign out" aria-label="Sign out">' +
    icon("logout") + "<span>Sign out</span></button></div>";
  header.innerHTML =
    '<button class="icon-button mobile-menu" type="button" data-drawer-toggle aria-controls="workspaceDrawer">' + icon("menu") + "</button>" +
    '<div><p class="eyebrow" id="moduleEyebrow"></p><h1 id="moduleTitle"></h1></div>' +
    '<div class="header-actions"><span class="connection-state" id="connectionState" role="status" aria-live="polite"><i aria-hidden="true"></i><span>Connecting</span></span>' +
    '<button class="button secondary" id="refreshBtn" type="button" aria-label="Refresh page" title="Refresh page">' + icon("refresh") + "<span>Refresh</span></button></div>";

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.id = "mobileBackdrop";
  backdrop.className = "mobile-backdrop";
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-label", "Close navigation");
  document.body.appendChild(backdrop);
  const mobile = window.matchMedia("(max-width: 680px)");
  let previousFocus = null;

  function syncDrawer() {
    const open = drawer.classList.contains("mobile-open");
    const expanded = mobile.matches ? open : !document.documentElement.classList.contains("drawer-collapsed");
    drawer.inert = mobile.matches && !open;
    document.getElementById("workspaceMain").inert = mobile.matches && open;
    backdrop.hidden = !mobile.matches || !open;
    document.body.classList.toggle("navigation-open", mobile.matches && open);
    document.querySelectorAll("[data-drawer-toggle]").forEach(function (button) {
      const label = expanded ? "Collapse navigation" : "Open navigation";
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });
  }

  function closeMobile() {
    drawer.classList.remove("mobile-open");
    syncDrawer();
    if (mobile.matches && previousFocus) previousFocus.focus();
    previousFocus = null;
  }

  document.addEventListener("click", function (event) {
    const toggle = event.target.closest("[data-drawer-toggle]");
    if (!toggle) return;
    if (mobile.matches) {
      if (drawer.classList.contains("mobile-open")) closeMobile();
      else {
        previousFocus = toggle;
        drawer.classList.add("mobile-open");
        syncDrawer();
        drawer.querySelector("[data-drawer-toggle]").focus();
      }
    } else {
      const collapsed = document.documentElement.classList.toggle("drawer-collapsed");
      try { window.localStorage.setItem("jrpp-workspace-drawer", collapsed ? "collapsed" : "expanded"); } catch (error) {
        console.warn("Navigation preference could not be saved.", error);
      }
      syncDrawer();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (!mobile.matches || !drawer.classList.contains("mobile-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobile();
    } else if (event.key === "Tab") {
      const controls = Array.from(drawer.querySelectorAll("a,button")).filter(function (node) { return node.getClientRects().length && !node.disabled; });
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  backdrop.addEventListener("click", closeMobile);
  mobile.addEventListener("change", function () {
    closeMobile();
    syncDrawer();
  });

  function setActive(key) {
    document.querySelectorAll("[data-shell-page]").forEach(function (link) {
      const active = link.dataset.shellPage === key;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const title = titles[key] || titles.orders;
    document.getElementById("moduleEyebrow").textContent = title[0];
    document.getElementById("moduleTitle").textContent = title[1];
  }

  function setConnection(text, kind) {
    const node = document.getElementById("connectionState");
    node.className = "connection-state " + (kind || "");
    node.querySelector("span").textContent = text;
  }

  function setViewer(viewer) {
    const account = viewer || {};
    const name = account.displayName || account.name || account.email || "Administrator";
    document.getElementById("viewerName").textContent = name;
    document.getElementById("viewerEmail").textContent = account.email || "";
    document.getElementById("viewerInitials").textContent = name.trim().split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
    document.querySelectorAll("[data-shell-restricted]").forEach(function (link) {
      link.hidden = !["owner", "developer"].includes(account.role);
    });
  }

  var scrollTimers = new WeakMap();
  document.addEventListener("scroll", function (event) {
    var node = event.target === document ? document.documentElement : event.target;
    if (!node || !node.classList) return;
    node.classList.add("is-scrolling");
    clearTimeout(scrollTimers.get(node));
    scrollTimers.set(node, setTimeout(function () { node.classList.remove("is-scrolling"); }, 900));
  }, { capture: true, passive: true });

  window.adminShell = { setActive: setActive, setViewer: setViewer, setConnection: setConnection, closeMobile: closeMobile };
  setActive(page);
  syncDrawer();
})();
