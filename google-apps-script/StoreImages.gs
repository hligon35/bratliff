function uploadStoreBookImage(bookId, fileName, mimeType, base64Data) {
  storeRequireAdmin_();
  const found = findStoreBook_(bookId);
  if (!found) throw new Error('Save the book before uploading its image.');

  mimeType = storeText_(mimeType, 100).toLowerCase();
  if (STORE_CONFIG.ALLOWED_IMAGE_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Use a PNG, JPG, JPEG, or WebP image.');
  }

  const bytes = Utilities.base64Decode(String(base64Data || '').replace(/^data:[^;]+;base64,/, ''));
  if (!bytes.length) throw new Error('The selected image is empty.');
  if (bytes.length > STORE_CONFIG.MAX_IMAGE_BYTES) throw new Error('Image must be 6 MB or smaller.');

  const safeName = sanitizeStoreFileName_(fileName || found.object.sku + '.png');
  const folder = ensureStoreImageFolder_();
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    console.warn('Could not enable link sharing for product image: ' + error);
  }

  const url = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w1600';
  const fileIdCol = STORE_BOOK_HEADERS.indexOf('Image File ID') + 1;
  const urlCol = STORE_BOOK_HEADERS.indexOf('Image URL') + 1;
  const updatedCol = STORE_BOOK_HEADERS.indexOf('Updated') + 1;

  const oldFileId = String(found.object.imageFileId || '').trim();
  found.sheet.getRange(found.row, fileIdCol).setValue(file.getId());
  found.sheet.getRange(found.row, urlCol).setValue(url);
  found.sheet.getRange(found.row, updatedCol).setValue(storeNow_());

  if (oldFileId && oldFileId !== file.getId()) {
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (error) {}
  }

  return { ok: true, fileId: file.getId(), imageUrl: url };
}

function removeStoreBookImage(bookId) {
  storeRequireAdmin_();
  const found = findStoreBook_(bookId);
  if (!found) throw new Error('Book not found.');
  if (found.object.imageFileId) {
    try { DriveApp.getFileById(found.object.imageFileId).setTrashed(true); } catch (error) {}
  }
  found.sheet.getRange(found.row, STORE_BOOK_HEADERS.indexOf('Image File ID') + 1).clearContent();
  found.sheet.getRange(found.row, STORE_BOOK_HEADERS.indexOf('Image URL') + 1).clearContent();
  found.sheet.getRange(found.row, STORE_BOOK_HEADERS.indexOf('Updated') + 1).setValue(storeNow_());
  return { ok: true };
}

function sanitizeStoreFileName_(name) {
  const cleaned = String(name || 'book-image').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 120) || 'book-image.png';
}
