function renderStoreAdmin_() {
  if (!getAuthorizedAdminEmail_()) return unauthorizedAdminPage_();

  const serviceUrl = ScriptApp.getService().getUrl();
  const websiteAdminUrl = serviceUrl ? serviceUrl + '?action=admin' : '';
  let html = HtmlService.createHtmlOutputFromFile('StoreAdmin').getContent();

  if (websiteAdminUrl) {
    const adminLink = '<div style="position:fixed;right:18px;bottom:18px;z-index:9999;">' +
      '<a href="' + escapeHtml_(websiteAdminUrl) + '" target="_top" ' +
      'style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0a1628;color:#fff;text-decoration:none;font:700 13px Arial,sans-serif;box-shadow:0 8px 22px rgba(10,22,40,.2);">Website Admin</a>' +
      '</div>';
    html = html.replace('</body>', adminLink + '</body>');
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle('Publisher Store Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
