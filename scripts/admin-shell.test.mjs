import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const source = read("assets/admin-shell.js");
const pages = ["index", "author", "sponsors", "newsletter", "analytics", "activity", "profile", "settings", "store"];

function createShell({ page = "author", mobile = false, collapsed = false, missingHeader = false } = {}) {
  const ids = new Map();
  const listeners = new Map();
  const preferences = new Map();
  const links = [];
  const toggles = [];
  const document = {
    activeElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    getElementById(id) { return ids.get(id); },
    createElement() { return element(); },
    querySelector(selector) {
      return selector === "[data-admin-shell-drawer]" ? drawer : missingHeader ? null : header;
    },
    querySelectorAll(selector) {
      if (selector === "[data-drawer-toggle]") return toggles;
      if (selector === "[data-shell-page]") return links;
      if (selector === "[data-shell-restricted]") return links.filter((link) => link.restricted);
      throw new Error("Unexpected selector: " + selector);
    },
  };
  function element() {
    const classes = new Set();
    const attributes = new Map();
    return {
      dataset: {}, hidden: false, disabled: false, textContent: "",
      classList: {
        contains: (name) => classes.has(name),
        remove: (name) => classes.delete(name),
        add: (name) => classes.add(name),
        toggle(name, force = !classes.has(name)) {
          if (force) classes.add(name);
          else classes.delete(name);
          return force;
        },
      },
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(type, listener) { this[type] = listener; },
      focus() { document.activeElement = this; },
      getClientRects() { return this.hidden ? [] : [{}]; },
      closest(selector) { return selector === "[data-drawer-toggle]" && toggles.includes(this) ? this : null; },
    };
  }
  const drawer = element(), header = element();
  Object.defineProperty(drawer, "innerHTML", {
    set(html) {
      drawer.markup = html;
      for (const match of html.matchAll(/<a\b([^>]*)>/g)) {
        const key = /data-shell-page="([^"]+)"/.exec(match[1]);
        if (!key) continue;
        const link = element();
        link.dataset.shellPage = key[1];
        link.restricted = match[1].includes("data-shell-restricted");
        link.hidden = match[1].includes(" hidden");
        links.push(link);
      }
      for (const match of html.matchAll(/id="([^"]+)"/g)) ids.set(match[1], element());
      toggles.push(element());
    },
  });
  Object.defineProperty(header, "innerHTML", {
    set(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) ids.set(match[1], element());
      const connectionText = element();
      ids.get("connectionState").querySelector = () => connectionText;
      toggles.push(element());
    },
  });
  drawer.querySelector = () => toggles[0];
  drawer.querySelectorAll = () => [toggles[0], ...links, ids.get("signOutBtn")];
  document.body = element();
  document.body.dataset = page === "index" ? {} : { adminPage: page };
  document.body.appendChild = (node) => ids.set(node.id, node);
  document.documentElement = element();
  ids.set("workspaceMain", element());
  if (collapsed) document.documentElement.classList.add("drawer-collapsed");
  const media = { matches: mobile, addEventListener(type, listener) { this[type] = listener; } };
  const window = {
    matchMedia: () => media,
    localStorage: { setItem: (key, value) => preferences.set(key, value) },
  };
  vm.runInNewContext(source, { window, document, console });
  return {
    shell: window.adminShell, drawer, document, ids, links, toggles, preferences, media,
    click(target) { listeners.get("click")({ target }); },
    key(key, shiftKey = false) {
      let prevented = false;
      listeners.get("keydown")({ key, shiftKey, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

test("every admin page loads exactly one shared shell before its controller", () => {
  for (const page of pages) {
    const html = read(`admin/${page}.html`);
    assert.equal((html.match(/data-admin-shell-drawer/g) || []).length, 1, page);
    assert.equal((html.match(/data-admin-shell-header/g) || []).length, 1, page);
    assert.equal((html.match(/<main\b/g) || []).length, 1, page);
    assert.match(html, /id="workspaceMain"/);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /id="workspaceMain" tabindex="-1"/);
    if (page !== "index") assert.ok(html.includes(`href="/admin/${page}.html#workspaceMain"`), page);
    assert.match(html, /admin-shell\.css/);
    assert.ok(html.indexOf("admin-shell.js") < html.indexOf(page === "index" ? "admin-workspace.js" : "admin.js"), page);
    assert.ok(!/jrpp-admin-switcher|jrpp-admin-nav|admin-drawer-collapsed/.test(html), page);
  }
});

test("legacy navigation styles and duplicate controllers are removed", () => {
  assert.doesNotMatch(read("assets/admin.css"), /jrpp-admin-switcher|jrpp-admin-nav|admin-drawer-collapsed/);
  assert.doesNotMatch(read("assets/admin.js"), /renderAdminNavigation|initAdminDrawer|adminNavItems|globalLogoutBtn|globalRefreshBtn/);
  assert.doesNotMatch(read("assets/admin-workspace.js"), /localStorage\.setItem\("jrpp-workspace-drawer"/);
  assert.match(read("assets/admin-shell.css"), /\.nav-item\[hidden\]\{display:none\}/);
  assert.match(read("assets/admin-shell.css"), /\.mobile-backdrop:not\(\[hidden\]\)\{display:block\}/);
});

test("the shell uses native links and preserves in-page workspace navigation", () => {
  const workspace = createShell({ page: "index" });
  assert.match(workspace.drawer.markup, /href="\/admin\/index.html\?view=mailbox"[^>]*data-view="mailbox"/);
  const editor = createShell();
  assert.doesNotMatch(editor.drawer.markup, /data-view=/);
  assert.match(editor.drawer.markup, /href="\/admin\/index.html\?view=orders"/);
  assert.equal(editor.links.length, 12);
});

test("only owners and developers see restricted links; unknown sessions fail closed", () => {
  const app = createShell();
  const restricted = app.links.filter((link) => link.restricted);
  assert.equal(restricted.length, 3);
  assert.ok(restricted.every((link) => link.hidden));
  for (const role of ["owner", "developer", "manager", "", "unexpected"]) {
    app.shell.setViewer({ email: "test@example.invalid", role });
    assert.ok(restricted.every((link) => link.hidden === !["owner", "developer"].includes(role)), role);
  }
});

test("each page has one active link, and account updates do not rebuild navigation", () => {
  for (const page of pages) {
    const app = createShell({ page });
    const active = app.links.filter((link) => link.getAttribute("aria-current") === "page");
    assert.equal(active.length, 1, page);
    assert.equal(active[0].dataset.shellPage, page === "index" ? "orders" : page);
    app.ids.get("mailNavCount").textContent = "7";
    app.shell.setViewer({ displayName: "<Test> Owner", email: "test@example.invalid", role: "owner" });
    assert.equal(app.ids.get("viewerName").textContent, "<Test> Owner");
    assert.equal(app.ids.get("viewerInitials").textContent, "<O");
    assert.equal(app.ids.get("mailNavCount").textContent, "7");
  }
});

test("desktop collapse shares one persistent preference and keeps mobile state separate", () => {
  const app = createShell({ collapsed: true });
  assert.equal(app.toggles[0].getAttribute("aria-expanded"), "false");
  app.click(app.toggles[0]);
  assert.equal(app.preferences.get("jrpp-workspace-drawer"), "expanded");
  assert.equal(app.toggles[0].getAttribute("aria-expanded"), "true");
  app.click(app.toggles[0]);
  assert.equal(app.preferences.get("jrpp-workspace-drawer"), "collapsed");
  app.media.matches = true;
  app.media.change();
  assert.equal(app.drawer.inert, true);
  assert.equal(app.ids.get("mobileBackdrop").hidden, true);
});

test("mobile navigation supports focus containment, Escape and backdrop dismissal", () => {
  const app = createShell({ mobile: true });
  const trigger = app.toggles[1];
  app.click(trigger);
  assert.equal(app.drawer.inert, false);
  assert.equal(app.ids.get("workspaceMain").inert, true);
  assert.equal(app.ids.get("mobileBackdrop").hidden, false);
  assert.equal(app.document.activeElement, app.toggles[0]);
  app.ids.get("signOutBtn").focus();
  assert.equal(app.key("Tab"), true);
  assert.equal(app.document.activeElement, app.toggles[0]);
  assert.equal(app.key("Tab", true), true);
  assert.equal(app.document.activeElement, app.ids.get("signOutBtn"));
  assert.equal(app.key("Escape"), true);
  assert.equal(app.drawer.inert, true);
  assert.equal(app.ids.get("workspaceMain").inert, false);
  assert.equal(app.document.activeElement, trigger);
  app.click(trigger);
  app.ids.get("mobileBackdrop").click();
  assert.equal(app.ids.get("mobileBackdrop").hidden, true);
  assert.equal(app.preferences.size, 0);
});

test("connection failures remain explicit, and incomplete shell markup is rejected", () => {
  const app = createShell();
  app.shell.setConnection("Connection issue", "error");
  assert.equal(app.ids.get("connectionState").className, "connection-state error");
  assert.equal(app.ids.get("connectionState").querySelector("span").textContent, "Connection issue");
  assert.throws(() => createShell({ missingHeader: true }), /missing its workspace shell/);
});

test("the service worker cache includes the shared shell and has a new version", () => {
  const sw = read("admin/service-worker.js");
  assert.match(sw, /jrpp-admin-shell-v7/);
  assert.match(sw, /"\/assets\/admin-shell\.css"/);
  assert.match(sw, /"\/assets\/admin-shell\.js"/);
});

test("page-specific editing and management controls remain available", () => {
  const controls = {
    author: ["authorForm", "publishAuthorBtn", "authorList"],
    sponsors: ["sponsorList", "publishSponsorBtn", "sponsorStatus"],
    newsletter: ["newsletterAdminRoot", "saveBtn", "scheduleBtn", "campaignLibraryOverlay"],
    analytics: ["analyticsRangeFilter", "analyticsMetrics", "resourceRegistrations"],
    activity: ["activityLogTable", "activityLogStatus", "activityRefreshBtn"],
    profile: ["adminForm", "adminFormDialog", "adminList"],
    settings: ["settingsForm", "settingsAvatar", "settingsStatus"],
    store: ["bookForm", "setupBtn", "syncSquareStockBtn", "bookList"],
  };
  for (const [page, ids] of Object.entries(controls)) {
    const html = read(`admin/${page}.html`);
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `${page}: ${id}`);
  }
});
