function renderStoreAdmin_() {
  if (!getAuthorizedAdminEmail_()) return unauthorizedAdminPage_();

  // Build all authenticated admin workspaces inside one Apps Script page.
  // Avoid iframes because script.google.com blocks self-embedding.
  let storeHtml =
    HtmlService.createHtmlOutputFromFile("StoreAdmin").getContent();
  const dashboardHtml = renderAdminDashboard_().getContent();
  const dashboardBody = extractHtmlBody_(dashboardHtml);
  const newsletterHtml =
    HtmlService.createHtmlOutputFromFile("NewsletterAdmin").getContent();
  const newsletterBody = extractHtmlBody_(newsletterHtml);
  const newsletterHead = extractHtmlHeadExtras_(newsletterHtml);

  const shellCss =
    "<style>" +
    ".jrpp-admin-switcher{position:sticky;top:0;z-index:10000;background:#0a1628;border-bottom:4px solid #d4ad55;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}" +
    ".jrpp-admin-brand{color:#fff;font:700 18px Georgia,serif}.jrpp-admin-brand small{display:block;color:#d4ad55;font:700 10px Arial,sans-serif;letter-spacing:1.3px;text-transform:uppercase;margin-top:2px}" +
    ".jrpp-admin-nav{display:flex;gap:8px;flex-wrap:wrap}.jrpp-admin-nav button{border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;border-radius:999px;padding:9px 14px;font:700 13px Arial,sans-serif;cursor:pointer}.jrpp-admin-nav button.active,.jrpp-admin-nav button:hover{background:#d4ad55;border-color:#d4ad55;color:#0a1628}" +
    "#jrppDashboardWorkspace{display:block;background:#fbf8f1;min-height:calc(100vh - 68px)}" +
    "#jrppStoreWorkspace,#jrppNewsletterWorkspace{display:none}" +
    "#jrppStoreWorkspace .metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}" +
    "#jrppStoreWorkspace .metrics .metric:first-child{grid-column:1/-1}" +
    "@media(max-width:640px){.jrpp-admin-switcher{align-items:flex-start}.jrpp-admin-nav{width:100%}.jrpp-admin-nav button{flex:1}#jrppStoreWorkspace .metrics{grid-template-columns:1fr!important}#jrppStoreWorkspace .metrics .metric:first-child{grid-column:auto}}" +
    "</style>";

  const shellHeader =
    '<div class="jrpp-admin-switcher">' +
    '<div class="jrpp-admin-brand">Jackrabbit Punkin Publishing<small>Secure Admin System</small></div>' +
    '<div class="jrpp-admin-nav" role="navigation" aria-label="Admin workspace">' +
    '<button type="button" id="jrppDashboardTab" class="active" onclick="jrppShowWorkspace(\'dashboard\')">Admin Dashboard</button>' +
    '<button type="button" id="jrppStoreTab" onclick="jrppShowWorkspace(\'store\')">Book Store Manager</button>' +
    '<button type="button" id="jrppNewsletterTab" onclick="jrppShowWorkspace(\'newsletter\')">Newsletter Builder</button>' +
    "</div>" +
    "</div>" +
    '<div id="jrppDashboardWorkspace">' +
    dashboardBody +
    "</div>" +
    '<div id="jrppStoreWorkspace">';

  const middle = '</div><div id="jrppNewsletterWorkspace">' + newsletterBody;

  const shellScript =
    "</div><script>" +
    "function jrppShowWorkspace(name){" +
    'var map={dashboard:["jrppDashboardWorkspace","jrppDashboardTab"],store:["jrppStoreWorkspace","jrppStoreTab"],newsletter:["jrppNewsletterWorkspace","jrppNewsletterTab"]};' +
    'Object.keys(map).forEach(function(key){var active=key===name;document.getElementById(map[key][0]).style.display=active?"block":"none";document.getElementById(map[key][1]).classList.toggle("active",active);});' +
    "window.scrollTo(0,0);" +
    "}" +
    'function jrppShowDashboard(){jrppShowWorkspace("dashboard")}' +
    'function jrppShowStore(){jrppShowWorkspace("store")}' +
    'function jrppShowNewsletter(){jrppShowWorkspace("newsletter")}' +
    "</script>";

  storeHtml = storeHtml.replace(
    "</head>",
    newsletterHead + shellCss + "</head>",
  );
  storeHtml = storeHtml.replace("<body>", "<body>" + shellHeader);
  storeHtml = storeHtml.replace("</body>", middle + shellScript + "</body>");

  return HtmlService.createHtmlOutput(storeHtml)
    .setTitle("Jackrabbit Punkin Publishing Admin")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function extractHtmlBody_(html) {
  const source = String(html || "");
  const match = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : source;
}

function extractHtmlHeadExtras_(html) {
  const source = String(html || "");
  const match = source.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!match) return "";
  return match[1]
    .replace(/<base[^>]*>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
}
