function renderStoreAdmin_() {
  if (!getAuthorizedAdminEmail_()) return unauthorizedAdminPage_();
  return HtmlService.createHtmlOutputFromFile('StoreAdmin')
    .setTitle('Publisher Store Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
