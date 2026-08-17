const SPREADSHEET_ID = '1301NQv9MQwOXOp88wPBW4HmJpqzd234sHhrVUrp3I9g';
const ADMIN_EMAIL = 'Publisher@JackrabbitPunkinPublishing.com';
const SENDER_NAME = 'Jackrabbit Punkin Publishing LLC';
const SITE_URL = 'https://hligon35.github.io/bratliff/';

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

    let emailSent = false;
    try {
      sendSubmissionEmails_(payload, route);
      emailSent = true;
    } catch (emailError) {
      // A mail quota or delivery error must never discard a valid sheet submission.
      console.error('Submission saved, but confirmation email failed: ' + emailError);
    }

    return jsonResponse_({ ok: true, emailSent: emailSent });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function sendSubmissionEmails_(payload, route) {
  const submitterEmail = String(payload.email || '').trim();
  const messages = buildMessages_(payload, route);
  const errors = [];

  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: messages.admin.subject,
      body: messages.admin.text,
      htmlBody: messages.admin.html,
      name: SENDER_NAME + ' Website',
      replyTo: isValidEmail_(submitterEmail) ? submitterEmail : ADMIN_EMAIL
    });
  } catch (error) {
    errors.push('admin notification: ' + String(error));
  }

  if (isValidEmail_(submitterEmail)) {
    try {
      MailApp.sendEmail({
        to: submitterEmail,
        subject: messages.user.subject,
        body: messages.user.text,
        htmlBody: messages.user.html,
        name: SENDER_NAME,
        replyTo: ADMIN_EMAIL
      });
    } catch (error) {
      errors.push('user confirmation: ' + String(error));
    }
  } else {
    errors.push('user confirmation: invalid email address');
  }

  if (errors.length) throw new Error(errors.join('; '));
}

function buildMessages_(payload, route) {
  const formType = String(payload.formType || '');
  const firstName = getFirstName_(payload.name);
  const userCopy = getUserCopy_(formType, payload);
  const adminSubject = getAdminSubject_(formType, payload);
  const details = getAdminDetails_(payload, route);

  return {
    admin: {
      subject: adminSubject,
      text: buildAdminText_(route.sheet, details),
      html: buildEmailHtml_({
        eyebrow: 'NEW WEBSITE SUBMISSION',
        heading: route.sheet,
        intro: 'A new submission was received from the Jackrabbit Punkin Publishing website.',
        details: details,
        buttonLabel: 'Open website',
        buttonUrl: SITE_URL,
        footer: 'This administrative notification was generated automatically by the website.'
      })
    },
    user: {
      subject: userCopy.subject,
      text: buildUserText_(firstName, userCopy),
      html: buildEmailHtml_({
        eyebrow: 'THANK YOU',
        heading: userCopy.heading,
        intro: 'Hi ' + firstName + ',',
        paragraphs: userCopy.paragraphs,
        buttonLabel: 'Visit our website',
        buttonUrl: SITE_URL,
        footer: userCopy.footer
      })
    }
  };
}

function getUserCopy_(formType, payload) {
  const copies = {
    contact: {
      subject: 'We received your message | Jackrabbit Punkin Publishing',
      heading: 'Your message is on its way',
      paragraphs: [
        'Thank you for contacting Jackrabbit Punkin Publishing LLC. We received your message and will review it shortly.',
        'You can expect a response within 2–3 business days.'
      ],
      footer: 'You received this confirmation because you submitted the contact form on our website.'
    },
    newsletter: {
      subject: 'Welcome to Jackrabbit Punkin Publishing',
      heading: 'You’re on the list',
      paragraphs: [
        'Thank you for joining our community. We’ll share new releases, author news, events, and Read It Forward updates with you.',
        'To leave the list at any time, reply to this email and ask to be removed.'
      ],
      footer: 'You received this confirmation because you subscribed on our website.'
    },
    speaking: {
      subject: 'Speaking request received | Jackrabbit Punkin Publishing',
      heading: 'Thank you for the invitation',
      paragraphs: [
        'We received your speaking request and appreciate your interest.',
        'Our team will review the event details and follow up about fit, availability, and format.'
      ],
      footer: 'You received this confirmation because you submitted a speaking request on our website.'
    },
    bookClub: {
      subject: 'Book club request received | Jackrabbit Punkin Publishing',
      heading: 'We received your book club request',
      paragraphs: [
        'Thank you for inviting Jackrabbit Punkin Publishing to connect with your reading community.',
        'Our team will review your request and follow up using the contact information you provided.'
      ],
      footer: 'You received this confirmation because you submitted a book club request on our website.'
    },
    bookNotification: {
      subject: 'Book update requested | Jackrabbit Punkin Publishing',
      heading: 'We’ll keep you posted',
      paragraphs: [
        'You’re on the notification list for “' + safeText_(payload.title, 200) + '.”',
        'We’ll let you know when meaningful release news becomes available.'
      ],
      footer: 'You received this confirmation because you requested a book notification on our website.'
    }
  };
  return copies[formType] || copies.contact;
}

function getAdminSubject_(formType, payload) {
  const subjects = {
    contact: '[Website] New Contact Inquiry — ' + safeText_(payload.subject, 120),
    newsletter: '[Website] New Newsletter Subscriber',
    speaking: '[Website] New Speaking Request — ' + safeText_(payload.organization, 120),
    bookClub: '[Website] New Book Club Request — ' + safeText_(payload.group, 120),
    bookNotification: '[Website] New Book Notification — ' + safeText_(payload.title, 120)
  };
  return subjects[formType] || '[Website] New Form Submission';
}

function getAdminDetails_(payload, route) {
  const labels = {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    subject: 'Subject',
    message: 'Message',
    organization: 'Organization',
    type: 'Event type',
    date: 'Preferred date',
    location: 'Location',
    audience: 'Audience',
    details: 'Event details',
    group: 'Book club / group',
    size: 'Group size',
    format: 'Preferred format',
    request: 'Request',
    notes: 'Notes',
    title: 'Book title',
    consent: 'Marketing consent',
    pageUrl: 'Submitted from',
    userAgent: 'Browser / device'
  };

  return route.fields.map(function (field) {
    let value = payload[field];
    if (field === 'consent') value = /^(true|yes|on|1)$/i.test(String(value || '')) ? 'Yes' : 'No';
    return {
      label: labels[field] || field,
      value: safeText_(value, field === 'message' || field === 'details' || field === 'notes' ? 5000 : 500) || '—'
    };
  });
}

function buildAdminText_(sheetName, details) {
  const lines = [
    'NEW WEBSITE SUBMISSION',
    '',
    sheetName,
    'A new submission was received from the Jackrabbit Punkin Publishing website.',
    ''
  ];
  details.forEach(function (item) {
    lines.push(item.label + ': ' + item.value);
  });
  lines.push('', 'Website: ' + SITE_URL);
  return lines.join('\n');
}

function buildUserText_(firstName, copy) {
  return [
    copy.heading,
    '',
    'Hi ' + firstName + ',',
    '',
    copy.paragraphs.join('\n\n'),
    '',
    'Visit our website: ' + SITE_URL,
    '',
    'Stories That Inspire. Books That Endure.',
    'Jackrabbit Punkin Publishing LLC',
    '',
    copy.footer
  ].join('\n');
}

function buildEmailHtml_(options) {
  const paragraphs = (options.paragraphs || []).map(function (paragraph) {
    return '<p style="margin:0 0 18px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml_(paragraph) + '</p>';
  }).join('');

  const details = (options.details || []).map(function (item, index) {
    const border = index ? 'border-top:1px solid #e7dfd0;' : '';
    return '<tr>' +
      '<td style="' + border + 'padding:12px 14px;width:32%;color:#542476;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;vertical-align:top;">' + escapeHtml_(item.label) + '</td>' +
      '<td style="' + border + 'padding:12px 14px;color:#26354a;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;">' + linkValue_(item.value) + '</td>' +
      '</tr>';
  }).join('');

  const content = paragraphs || (details ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7dfd0;border-radius:8px;border-collapse:separate;overflow:hidden;">' + details + '</table>' : '');

  return '<!doctype html><html><body style="margin:0;padding:0;background:#fbf8f1;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf8f1;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(10,22,40,.08);">' +
    '<tr><td style="background:#0a1628;padding:28px 32px;">' +
    '<table role="presentation" cellspacing="0" cellpadding="0"><tr>' +
    '<td style="width:52px;height:52px;border:2px solid #d4ad55;border-radius:50%;color:#d4ad55;text-align:center;font-family:Georgia,serif;font-size:19px;font-weight:700;">JP</td>' +
    '<td style="padding-left:16px;color:#ffffff;"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;line-height:1.2;">Jackrabbit Punkin Publishing</div><div style="margin-top:5px;color:#d4ad55;font-size:12px;letter-spacing:.6px;">Stories That Inspire. Books That Endure.</div></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="height:5px;background:#d4ad55;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:36px 32px 32px;">' +
    '<div style="margin-bottom:10px;color:#542476;font-size:12px;font-weight:700;letter-spacing:1.6px;">' + escapeHtml_(options.eyebrow) + '</div>' +
    '<h1 style="margin:0 0 18px;color:#0a1628;font-family:Georgia,serif;font-size:30px;line-height:1.2;">' + escapeHtml_(options.heading) + '</h1>' +
    '<p style="margin:0 0 20px;color:#26354a;font-size:16px;line-height:1.65;">' + escapeHtml_(options.intro) + '</p>' +
    content +
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml_(options.buttonUrl) + '" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml_(options.buttonLabel) + '</a></td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="background:#f4efe5;padding:22px 32px;color:#687386;font-size:12px;line-height:1.55;">' + escapeHtml_(options.footer) + '<br><span style="color:#0a1628;font-weight:700;">Jackrabbit Punkin Publishing LLC</span></td></tr>' +
    '</table></td></tr></table></body></html>';
}

function linkValue_(value) {
  const text = String(value || '');
  const escaped = escapeHtml_(text);
  if (isValidEmail_(text)) return '<a href="mailto:' + escaped + '" style="color:#542476;">' + escaped + '</a>';
  if (/^https?:\/\/[^\s]+$/i.test(text)) return '<a href="' + escaped + '" style="color:#542476;">' + escaped + '</a>';
  return escaped;
}

function getFirstName_(name) {
  const firstName = safeText_(name, 80).split(/\s+/)[0];
  return firstName || 'there';
}

function safeText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
