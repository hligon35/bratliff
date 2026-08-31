function renderStoreAdmin_() {
  if (!getAuthorizedAdminEmail_()) return unauthorizedAdminPage_();

  // Build both authenticated admin workspaces inside one Apps Script page.
  // Do not iframe the Apps Script web app into itself: script.google.com blocks
  // that with X-Frame-Options / frame-ancestor protections.
  let storeHtml = HtmlService.createHtmlOutputFromFile('StoreAdmin').getContent();
  const dashboardHtml = renderAdminDashboard_().getContent();
  const dashboardBody = extractHtmlBody_(dashboardHtml);

  const shellCss = '<style>' +
    '.jrpp-admin-switcher{position:sticky;top:0;z-index:10000;background:#0a1628;border-bottom:4px solid #d4ad55;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}' +
    '.jrpp-admin-brand{color:#fff;font:700 18px Georgia,serif}.jrpp-admin-brand small{display:block;color:#d4ad55;font:700 10px Arial,sans-serif;letter-spacing:1.3px;text-transform:uppercase;margin-top:2px}' +
    '.jrpp-admin-nav{display:flex;gap:8px;flex-wrap:wrap}.jrpp-admin-nav button{border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;border-radius:999px;padding:9px 14px;font:700 13px Arial,sans-serif;cursor:pointer}.jrpp-admin-nav button.active,.jrpp-admin-nav button:hover{background:#d4ad55;border-color:#d4ad55;color:#0a1628}' +
    '#jrppDashboardWorkspace{display:block;background:#fbf8f1;min-height:calc(100vh - 68px)}' +
    '#jrppStoreWorkspace{display:none}' +
    '@media(max-width:640px){.jrpp-admin-switcher{align-items:flex-start}.jrpp-admin-nav{width:100%}.jrpp-admin-nav button{flex:1}}' +
    '</style>';

  const shellHeader = '<div class="jrpp-admin-switcher">' +
    '<div class="jrpp-admin-brand">Jackrabbit Punkin Publishing<small>Secure Admin System</small></div>' +
    '<div class="jrpp-admin-nav" role="navigation" aria-label="Admin workspace">' +
      '<button type="button" id="jrppDashboardTab" class="active" onclick="jrppShowDashboard()">Admin Dashboard</button>' +
      '<button type="button" id="jrppStoreTab" onclick="jrppShowStore()">Book Store Manager</button>' +
    '</div>' +
  '</div>' +
  '<div id="jrppDashboardWorkspace">' + dashboardBody + '</div>' +
  '<div id="jrppStoreWorkspace">';

  const shellScript = '</div><script>' +
    'function jrppShowDashboard(){' +
      'document.getElementById("jrppDashboardWorkspace").style.display="block";' +
      'document.getElementById("jrppStoreWorkspace").style.display="none";' +
      'document.getElementById("jrppDashboardTab").classList.add("active");' +
      'document.getElementById("jrppStoreTab").classList.remove("active");' +
      'window.scrollTo(0,0);' +
    '}' +
    'function jrppShowStore(){' +
      'document.getElementById("jrppDashboardWorkspace").style.display="none";' +
      'document.getElementById("jrppStoreWorkspace").style.display="block";' +
      'document.getElementById("jrppDashboardTab").classList.remove("active");' +
      'document.getElementById("jrppStoreTab").classList.add("active");' +
      'window.scrollTo(0,0);' +
    '}' +
  '</script>';

  storeHtml = storeHtml.replace('</head>', shellCss + '</head>');
  storeHtml = storeHtml.replace('<body>', '<body>' + shellHeader);
  storeHtml = storeHtml.replace('</body>', shellScript + '</body>');

  return HtmlService.createHtmlOutput(storeHtml)
    .setTitle('Jackrabbit Punkin Publishing Admin')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function extractHtmlBody_(html) {
  const source = String(html || '');
  const match = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : source;
}
