const SPREADSHEET_ID = '1301NQv9MQwOXOp88wPBW4HmJpqzd234sHhrVUrp3I9g';

const FORM_ROUTES = Object.freeze({
  contact: {
    sheet: 'Contact',
    required: ['name', 'email', 'subject', 'message'],
    fields: ['name', 'email', 'phone', 'subject', 'message', 'pageUrl', 'userAgent']
  },
  newsletter: {
    sheet: 'Newsletter',
    required: ['email'],
    fields: ['email', 'pageUrl', 'consent']
  },
  speaking: {
    sheet: 'Speaking Requests',
    required: ['name', 'organization', 'email', 'details'],
    fields: ['name', 'organization', 'email', 'phone', 'type', 'date', 'location', 'audience', 'details', 'pageUrl', 'userAgent']
  },
  bookClub: {
    sheet: 'Book Club Requests',
    required: ['group', 'name', 'email', 'request'],
    fields: ['group', 'name', 'email', 'size', 'format', 'date', 'request', 'notes', 'pageUrl', 'userAgent']
  },
  bookNotification: {
    sheet: 'Book Notifications',
    required: ['email', 'title'],
    fields: ['email', 'title', 'pageUrl', 'userAgent']
  }
});

function doGet() {
  return jsonResponse_({ ok: true, service: 'Jackrabbit Punkin Publishing form endpoint' });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const payload = event && event.parameter ? event.parameter : {};

    // Honeypot submissions receive a neutral response without being stored.
    if (payload.website) return jsonResponse_({ ok: true });

    const route = FORM_ROUTES[payload.formType];
    if (!route) throw new Error('Unknown form type.');

    route.required.forEach(function (field) {
      if (!clean_(payload[field], 5000)) throw new Error('Missing required field: ' + field);
    });

    throttle_(payload.formType, payload.email || payload.name || 'anonymous');

    const row = [new Date()];
    route.fields.forEach(function (field) {
      if (field === 'consent') {
        row.push(/^(true|yes|on|1)$/i.test(String(payload[field] || '')));
      } else {
        row.push(clean_(payload[field], field === 'message' || field === 'details' || field === 'notes' ? 5000 : 500));
      }
    });
    row.push('New', '');

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(route.sheet);
    if (!sheet) throw new Error('Destination sheet not found.');
    sheet.appendRow(row);

    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function clean_(value, maxLength) {
  let text = String(value == null ? '' : value).trim().slice(0, maxLength);
  // Prevent spreadsheet formula injection while preserving the submitted text.
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function throttle_(formType, identity) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(formType) + ':' + String(identity).toLowerCase()
  );
  const key = 'submission_' + Utilities.base64EncodeWebSafe(digest).slice(0, 40);
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) throw new Error('Please wait before submitting again.');
  cache.put(key, '1', 20);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
