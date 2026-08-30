function renderStoreAdmin_() {
  if (!getAuthorizedAdminEmail_()) return unauthorizedAdminPage_();
  return HtmlService.createHtmlOutputFromFile('StoreAdminUI')
    .setTitle('Publisher Store Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
