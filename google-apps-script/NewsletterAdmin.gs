const NEWSLETTER_ADMIN_CONFIG = Object.freeze({
  CAMPAIGN_SHEET: 'Newsletter Campaigns',
  DEFAULT_TIME_ZONE: 'America/New_York',
  CAMPAIGN_HEADERS: [
    'Campaign ID', 'Created', 'Updated', 'Status', 'Title', 'Subject', 'Preview Text',
    'Audience', 'From Name', 'Hero Message', 'Hero CTA Label', 'Hero CTA URL',
    'Featured Book ID', 'Featured Book Title', 'Featured Book Description',
    'Featured CTA Label', 'Featured CTA URL', 'Quick Update 1 Title', 'Quick Update 1 Text',
    'Quick Update 1 URL', 'Quick Update 2 Title', 'Quick Update 2 Text', 'Quick Update 2 URL',
    'Closing Note', 'Send Date', 'Send Time', 'Time Zone', 'Scheduled At', 'Sent At',
    'Recipients', 'Sent', 'Failed', 'Last Error', 'Trigger ID'
  ]
});

function setupNewsletterBuilder() {
  newsletterRequireAdmin_();
  ensureNewsletterCampaignSheet_();
  return { ok: true, message: 'Newsletter Builder is ready.' };
}

function getNewsletterBuilderState() {
  newsletterRequireAdmin_();
  ensureNewsletterCampaignSheet_();

  let books = [];
  try {
    books = listStoreBooksAdmin().filter(function (book) {
      return String(book.status || '') !== 'Archived';
    }).map(function (book) {
      return {
        bookId: String(book.bookId || ''),
        title: String(book.title || ''),
        author: String(book.author || ''),
        shortDescription: String(book.shortDescription || book.synopsis || ''),
        imageUrl: String(book.imageUrl || ''),
        status: String(book.status || '')
      };
    });
  } catch (error) {
    console.error('Newsletter book list unavailable: ' + error);
  }

  return {
    subscriberCount: getActiveNewsletterSubscribers_().length,
    adminEmail: getAdminEmail_(),
    siteUrl: getSiteUrl_(),
    books: books,
    campaigns: listNewsletterCampaigns_(),
    defaults: {
      title: 'The Jackrabbit Journal',
      subject: 'A quick update from Jackrabbit Punkin Publishing',
      previewText: 'New stories, milestones, and what is ahead.',
      audience: 'All active subscribers',
      fromName: getSenderName_(),
      heroMessage: 'There is a lot happening at Jackrabbit Punkin Publishing, and we are excited to share a few highlights with you.',
      heroCtaLabel: 'Visit Jackrabbit Punkin Publishing',
      heroCtaUrl: getSiteUrl_(),
      featuredCtaLabel: 'Explore the book',
      quick1Title: 'Upcoming Events',
      quick1Text: 'See where Jackrabbit Punkin Publishing will be connecting with readers next.',
      quick1Url: getSiteUrl_(),
      quick2Title: 'Coming Soon',
      quick2Text: 'New stories, community histories, and future releases are on the way.',
      quick2Url: getSiteUrl_(),
      closingNote: 'Thank you for reading, sharing, and helping meaningful stories reach more people.',
      timeZone: NEWSLETTER_ADMIN_CONFIG.DEFAULT_TIME_ZONE
    }
  };
}

function saveNewsletterDraft(payload) {
  newsletterRequireAdmin_();
  return saveNewsletterCampaign_(payload, 'Draft');
}

function sendNewsletterTest(payload, testEmail) {
  newsletterRequireAdmin_();
  const email = String(testEmail || '').trim().toLowerCase();
  if (!isValidEmail_(email)) throw new Error('Enter a valid test email address.');

  const campaign = saveNewsletterCampaign_(payload, 'Draft');
  const unsubscribeUrl = getUnsubscribeUrl_(email) || getSiteUrl_();
  const html = buildNewsletterEmailHtml_(campaign, unsubscribeUrl);
  const text = buildNewsletterPlainText_(campaign, unsubscribeUrl);

  MailApp.sendEmail({
    to: email,
    subject: '[TEST] ' + campaign.subject,
    body: text,
    htmlBody: html,
    name: campaign.fromName || getSenderName_(),
    replyTo: getAdminEmail_()
  });

  return { ok: true, campaignId: campaign.campaignId, message: 'Test email sent to ' + email + '.' };
}

function sendNewsletterNow(payload) {
  newsletterRequireAdmin_();
  const campaign = saveNewsletterCampaign_(payload, 'Ready');
  return sendNewsletterCampaignById_(campaign.campaignId, true);
}

function scheduleNewsletterCampaign(payload) {
  newsletterRequireAdmin_();
  const campaign = saveNewsletterCampaign_(payload, 'Scheduled');
  const sendDate = String(campaign.sendDate || '').trim();
  const sendTime = String(campaign.sendTime || '').trim();
  const timeZone = String(campaign.timeZone || NEWSLETTER_ADMIN_CONFIG.DEFAULT_TIME_ZONE).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sendDate)) throw new Error('Choose a valid send date.');
  if (!/^\d{2}:\d{2}$/.test(sendTime)) throw new Error('Choose a valid send time.');

  let scheduledAt;
  try {
    scheduledAt = Utilities.parseDate(sendDate + ' ' + sendTime, timeZone, 'yyyy-MM-dd HH:mm');
  } catch (error) {
    throw new Error('The scheduled date, time, or time zone is invalid.');
  }
  if (scheduledAt.getTime() <= Date.now() + 60000) throw new Error('Schedule the newsletter at least one minute in the future.');

  removeNewsletterTrigger_(campaign.triggerId);
  const trigger = ScriptApp.newTrigger('runScheduledNewsletterCampaign')
    .timeBased()
    .at(scheduledAt)
    .create();

  updateNewsletterCampaignFields_(campaign.campaignId, {
    status: 'Scheduled',
    scheduledAt: scheduledAt,
    triggerId: trigger.getUniqueId(),
    lastError: ''
  });

  return {
    ok: true,
    campaignId: campaign.campaignId,
    scheduledAt: scheduledAt.toISOString(),
    message: 'Newsletter scheduled.'
  };
}

function cancelNewsletterSchedule(campaignId) {
  newsletterRequireAdmin_();
  const campaign = getNewsletterCampaignById_(campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  removeNewsletterTrigger_(campaign.triggerId);
  updateNewsletterCampaignFields_(campaign.campaignId, {
    status: 'Draft',
    scheduledAt: '',
    triggerId: '',
    lastError: ''
  });
  return { ok: true, message: 'Schedule cancelled.' };
}

function runScheduledNewsletterCampaign(event) {
  const triggerUid = event && event.triggerUid ? String(event.triggerUid) : '';
  if (!triggerUid) return;
  const campaign = findNewsletterCampaignByTrigger_(triggerUid);
  if (!campaign) return;

  try {
    sendNewsletterCampaignById_(campaign.campaignId, false);
  } catch (error) {
    updateNewsletterCampaignFields_(campaign.campaignId, {
      status: 'Error',
      lastError: String(error && error.message ? error.message : error),
      triggerId: ''
    });
    throw error;
  }
}

function sendNewsletterCampaignById_(campaignId, requireAdmin) {
  if (requireAdmin) newsletterRequireAdmin_();
  const campaign = getNewsletterCampaignById_(campaignId);
  if (!campaign) throw new Error('Campaign not found.');

  const subscribers = getActiveNewsletterSubscribers_();
  if (!subscribers.length) throw new Error('There are no active newsletter subscribers.');

  const quota = MailApp.getRemainingDailyQuota();
  if (subscribers.length > quota) {
    throw new Error('This send needs ' + subscribers.length + ' recipient slots, but the current MailApp quota has ' + quota + ' remaining.');
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  subscribers.forEach(function (email) {
    try {
      const unsubscribeUrl = getUnsubscribeUrl_(email) || getSiteUrl_();
      MailApp.sendEmail({
        to: email,
        subject: campaign.subject,
        body: buildNewsletterPlainText_(campaign, unsubscribeUrl),
        htmlBody: buildNewsletterEmailHtml_(campaign, unsubscribeUrl),
        name: campaign.fromName || getSenderName_(),
        replyTo: getAdminEmail_()
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push(email + ': ' + String(error && error.message ? error.message : error));
    }
  });

  removeNewsletterTrigger_(campaign.triggerId);
  updateNewsletterCampaignFields_(campaign.campaignId, {
    status: failed ? 'Sent with errors' : 'Sent',
    sentAt: new Date(),
    recipients: subscribers.length,
    sent: sent,
    failed: failed,
    lastError: errors.slice(0, 5).join(' | '),
    triggerId: ''
  });

  return {
    ok: failed === 0,
    campaignId: campaign.campaignId,
    recipients: subscribers.length,
    sent: sent,
    failed: failed,
    message: failed ? 'Newsletter sent with ' + failed + ' delivery error(s).' : 'Newsletter sent to ' + sent + ' subscriber(s).'
  };
}

function saveNewsletterCampaign_(payload, requestedStatus) {
  const clean = normalizeNewsletterPayload_(payload || {});
  ensureNewsletterCampaignSheet_();
  const sheet = getNewsletterCampaignSheet_();
  const existing = clean.campaignId ? getNewsletterCampaignById_(clean.campaignId) : null;
  const now = new Date();
  const campaignId = existing ? existing.campaignId : 'NL-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const created = existing ? existing.created : now;
  const status = requestedStatus || (existing ? existing.status : 'Draft');

  const campaign = Object.assign({}, clean, {
    campaignId: campaignId,
    created: created,
    updated: now,
    status: status,
    scheduledAt: existing ? existing.scheduledAt : '',
    sentAt: existing ? existing.sentAt : '',
    recipients: existing ? existing.recipients : '',
    sent: existing ? existing.sent : '',
    failed: existing ? existing.failed : '',
    lastError: '',
    triggerId: existing ? existing.triggerId : ''
  });

  const row = newsletterCampaignToRow_(campaign);
  if (existing) {
    sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return getNewsletterCampaignById_(campaignId);
}

function normalizeNewsletterPayload_(payload) {
  const text = function (key, max) { return safeText_(payload[key], max || 2000); };
  const subject = text('subject', 180);
  if (!subject) throw new Error('Email subject is required.');
  return {
    campaignId: text('campaignId', 100),
    title: text('title', 180) || 'The Jackrabbit Journal',
    subject: subject,
    previewText: text('previewText', 240),
    audience: text('audience', 120) || 'All active subscribers',
    fromName: text('fromName', 120) || getSenderName_(),
    heroMessage: text('heroMessage', 3000),
    heroCtaLabel: text('heroCtaLabel', 100),
    heroCtaUrl: safeNewsletterUrl_(payload.heroCtaUrl),
    featuredBookId: text('featuredBookId', 120),
    featuredBookTitle: text('featuredBookTitle', 240),
    featuredBookDescription: text('featuredBookDescription', 3000),
    featuredBookImageUrl: safeNewsletterUrl_(payload.featuredBookImageUrl),
    featuredCtaLabel: text('featuredCtaLabel', 100),
    featuredCtaUrl: safeNewsletterUrl_(payload.featuredCtaUrl),
    quick1Title: text('quick1Title', 180),
    quick1Text: text('quick1Text', 1500),
    quick1Url: safeNewsletterUrl_(payload.quick1Url),
    quick2Title: text('quick2Title', 180),
    quick2Text: text('quick2Text', 1500),
    quick2Url: safeNewsletterUrl_(payload.quick2Url),
    closingNote: text('closingNote', 2000),
    sendDate: text('sendDate', 20),
    sendTime: text('sendTime', 20),
    timeZone: text('timeZone', 80) || NEWSLETTER_ADMIN_CONFIG.DEFAULT_TIME_ZONE
  };
}

function buildNewsletterEmailHtml_(campaign, unsubscribeUrl) {
  const siteUrl = getSiteUrl_();
  const logoUrl = siteUrl + 'assets/jrppLogo.png';
  const preview = campaign.previewText
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + escapeHtml_(campaign.previewText) + '</div>'
    : '';
  const heroButton = campaign.heroCtaLabel && campaign.heroCtaUrl
    ? newsletterButtonHtml_(campaign.heroCtaLabel, campaign.heroCtaUrl)
    : '';
  const featured = campaign.featuredBookTitle
    ? '<tr><td style="padding:28px 34px;border-top:1px solid #e7dfcf;">' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
      (campaign.featuredBookImageUrl ? '<td width="130" valign="top" style="padding-right:20px;"><img src="' + escapeHtml_(campaign.featuredBookImageUrl) + '" width="110" alt="' + escapeHtml_(campaign.featuredBookTitle) + '" style="display:block;width:110px;height:auto;border:0;"></td>' : '') +
      '<td valign="top"><div style="color:#542476;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Featured title</div>' +
      '<h2 style="margin:7px 0 9px;color:#0a1628;font-family:Georgia,serif;font-size:25px;line-height:1.2;">' + escapeHtml_(campaign.featuredBookTitle) + '</h2>' +
      '<p style="margin:0;color:#4e596c;font-size:15px;line-height:1.65;">' + escapeHtml_(campaign.featuredBookDescription) + '</p>' +
      (campaign.featuredCtaLabel && campaign.featuredCtaUrl ? '<p style="margin:14px 0 0;"><a href="' + escapeHtml_(campaign.featuredCtaUrl) + '" style="color:#542476;font-weight:700;text-decoration:none;">' + escapeHtml_(campaign.featuredCtaLabel) + ' →</a></p>' : '') +
      '</td></tr></table></td></tr>'
    : '';
  const quickUpdates = buildNewsletterQuickUpdatesHtml_(campaign);

  return '<!doctype html><html><body style="margin:0;padding:0;background:#f3f0e9;font-family:Arial,Helvetica,sans-serif;">' + preview +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0e9;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;background:#fff;border:1px solid #e2dccf;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="background:#0a1628;padding:20px 28px;border-bottom:5px solid #d4ad55;">' +
      '<table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="58"><img src="' + escapeHtml_(logoUrl) + '" width="50" alt="Jackrabbit Punkin Publishing" style="display:block;width:50px;height:auto;border:0;"></td>' +
      '<td style="padding-left:12px;color:#fff;"><div style="font-family:Georgia,serif;font-size:20px;font-weight:700;">Jackrabbit Punkin Publishing</div><div style="margin-top:4px;color:#d4ad55;font-size:11px;letter-spacing:.5px;">Stories That Inspire. Books That Endure.</div></td></tr></table>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:34px 34px 29px;background:#fbf8f1;">' +
      '<div style="color:#542476;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">' + escapeHtml_(campaign.title) + '</div>' +
      '<h1 style="margin:10px 0 13px;color:#0a1628;font-family:Georgia,serif;font-size:31px;line-height:1.18;">' + escapeHtml_(campaign.subject) + '</h1>' +
      '<p style="margin:0;color:#485365;font-size:16px;line-height:1.65;">' + escapeHtml_(campaign.heroMessage) + '</p>' + heroButton +
    '</td></tr>' +
    featured + quickUpdates +
    '<tr><td style="padding:24px 34px;background:#f4efe5;border-top:1px solid #e7dfcf;">' +
      '<p style="margin:0 0 9px;color:#4e596c;font-size:15px;line-height:1.65;">' + escapeHtml_(campaign.closingNote) + '</p>' +
      '<div style="color:#0a1628;font-family:Georgia,serif;font-weight:700;">— Jackrabbit Punkin Publishing LLC</div>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:18px 26px;background:#0a1628;color:#bfc5cf;font-size:11px;line-height:1.65;">' +
      '<span style="color:#d4ad55;font-weight:700;">Jackrabbit Punkin Publishing LLC</span><br>Stories That Inspire. Books That Endure.<br>' +
      '<a href="' + escapeHtml_(siteUrl) + '" style="color:#fff;">Visit website</a> &nbsp;·&nbsp; <a href="' + escapeHtml_(unsubscribeUrl) + '" style="color:#fff;">Unsubscribe</a>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function buildNewsletterQuickUpdatesHtml_(campaign) {
  const has1 = campaign.quick1Title || campaign.quick1Text;
  const has2 = campaign.quick2Title || campaign.quick2Text;
  if (!has1 && !has2) return '';

  const card = function (title, text, url) {
    if (!title && !text) return '';
    return '<td valign="top" width="50%" style="padding:8px;"><div style="border:1px solid #e7dfcf;border-radius:10px;background:#fbf8f1;padding:16px;">' +
      '<div style="color:#0a1628;font-weight:700;font-size:15px;">' + escapeHtml_(title) + '</div>' +
      '<p style="margin:6px 0 0;color:#4e596c;font-size:14px;line-height:1.55;">' + escapeHtml_(text) + '</p>' +
      (url ? '<p style="margin:10px 0 0;"><a href="' + escapeHtml_(url) + '" style="color:#542476;font-weight:700;text-decoration:none;font-size:13px;">Learn more →</a></p>' : '') +
      '</div></td>';
  };

  return '<tr><td style="padding:27px 26px;border-top:1px solid #e7dfcf;">' +
    '<div style="padding:0 8px;color:#542476;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Quick updates</div>' +
    '<h2 style="padding:0 8px;margin:7px 0 9px;color:#0a1628;font-family:Georgia,serif;font-size:23px;">A few things worth knowing</h2>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' + card(campaign.quick1Title, campaign.quick1Text, campaign.quick1Url) + card(campaign.quick2Title, campaign.quick2Text, campaign.quick2Url) + '</tr></table>' +
    '</td></tr>';
}

function newsletterButtonHtml_(label, url) {
  return '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px auto 0;"><tr><td style="border-radius:999px;background:#542476;"><a href="' + escapeHtml_(url) + '" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">' + escapeHtml_(label) + '</a></td></tr></table>';
}

function buildNewsletterPlainText_(campaign, unsubscribeUrl) {
  const lines = [campaign.title, campaign.subject, '', campaign.heroMessage, ''];
  if (campaign.heroCtaLabel && campaign.heroCtaUrl) lines.push(campaign.heroCtaLabel + ': ' + campaign.heroCtaUrl, '');
  if (campaign.featuredBookTitle) {
    lines.push('FEATURED TITLE', campaign.featuredBookTitle, campaign.featuredBookDescription || '');
    if (campaign.featuredCtaUrl) lines.push(campaign.featuredCtaUrl);
    lines.push('');
  }
  if (campaign.quick1Title || campaign.quick1Text) lines.push(campaign.quick1Title, campaign.quick1Text, campaign.quick1Url || '', '');
  if (campaign.quick2Title || campaign.quick2Text) lines.push(campaign.quick2Title, campaign.quick2Text, campaign.quick2Url || '', '');
  lines.push(campaign.closingNote, '', 'Jackrabbit Punkin Publishing LLC', getSiteUrl_(), 'Unsubscribe: ' + unsubscribeUrl);
  return lines.filter(function (line, index, array) { return line !== '' || array[index - 1] !== ''; }).join('\n');
}

function getActiveNewsletterSubscribers_() {
  const route = FORM_ROUTES.newsletter;
  const sheet = SpreadsheetApp.openById(getSpreadsheetId_()).getSheetByName(route.sheet);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const emailIndex = route.fields.indexOf('email') + 1;
  const consentIndex = route.fields.indexOf('consent') + 1;
  const statusIndex = route.fields.length + 1;
  const seen = {};
  const active = [];

  for (let i = values.length - 1; i >= 1; i -= 1) {
    const row = values[i];
    const email = String(row[emailIndex] || '').trim().toLowerCase();
    if (!isValidEmail_(email) || seen[email]) continue;
    seen[email] = true;
    const consent = row[consentIndex] === true || /^(true|yes|on|1)$/i.test(String(row[consentIndex] || ''));
    const status = String(row[statusIndex] || '').trim().toLowerCase();
    if (consent && status !== 'unsubscribed') active.push(email);
  }
  return active.sort();
}

function listNewsletterCampaigns_() {
  const sheet = getNewsletterCampaignSheet_();
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, NEWSLETTER_ADMIN_CONFIG.CAMPAIGN_HEADERS.length).getValues();
  return values.map(function (row, index) {
    return newsletterRowToCampaign_(row, index + 2);
  }).reverse().slice(0, 30);
}

function getNewsletterCampaignById_(campaignId) {
  const id = String(campaignId || '').trim();
  if (!id) return null;
  const sheet = getNewsletterCampaignSheet_();
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, NEWSLETTER_ADMIN_CONFIG.CAMPAIGN_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === id) return newsletterRowToCampaign_(values[i], i + 2);
  }
  return null;
}

function findNewsletterCampaignByTrigger_(triggerId) {
  const id = String(triggerId || '').trim();
  if (!id) return null;
  return listNewsletterCampaigns_().find(function (campaign) { return String(campaign.triggerId || '') === id; }) || null;
}

function updateNewsletterCampaignFields_(campaignId, fields) {
  const campaign = getNewsletterCampaignById_(campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  const merged = Object.assign({}, campaign, fields || {}, { updated: new Date() });
  const row = newsletterCampaignToRow_(merged);
  getNewsletterCampaignSheet_().getRange(campaign.rowNumber, 1, 1, row.length).setValues([row]);
  return getNewsletterCampaignById_(campaignId);
}

function removeNewsletterTrigger_(triggerId) {
  const id = String(triggerId || '').trim();
  if (!id) return;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getUniqueId() === id) ScriptApp.deleteTrigger(trigger);
  });
}

function ensureNewsletterCampaignSheet_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId_());
  let sheet = ss.getSheetByName(NEWSLETTER_ADMIN_CONFIG.CAMPAIGN_SHEET);
  if (!sheet) sheet = ss.insertSheet(NEWSLETTER_ADMIN_CONFIG.CAMPAIGN_SHEET);
  const headers = NEWSLETTER_ADMIN_CONFIG.CAMPAIGN_HEADERS;
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const needsHeaders = headers.some(function (header, index) { return existing[index] !== header; });
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#d4ad55').setFontColor('#0a1628').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function getNewsletterCampaignSheet_() {
  return ensureNewsletterCampaignSheet_();
}

function newsletterCampaignToRow_(campaign) {
  return [
    campaign.campaignId || '', campaign.created || '', campaign.updated || '', campaign.status || 'Draft',
    campaign.title || '', campaign.subject || '', campaign.previewText || '', campaign.audience || '', campaign.fromName || '',
    campaign.heroMessage || '', campaign.heroCtaLabel || '', campaign.heroCtaUrl || '', campaign.featuredBookId || '',
    campaign.featuredBookTitle || '', campaign.featuredBookDescription || '', campaign.featuredCtaLabel || '', campaign.featuredCtaUrl || '',
    campaign.quick1Title || '', campaign.quick1Text || '', campaign.quick1Url || '', campaign.quick2Title || '', campaign.quick2Text || '',
    campaign.quick2Url || '', campaign.closingNote || '', campaign.sendDate || '', campaign.sendTime || '', campaign.timeZone || '',
    campaign.scheduledAt || '', campaign.sentAt || '', campaign.recipients || '', campaign.sent || '', campaign.failed || '',
    campaign.lastError || '', campaign.triggerId || ''
  ];
}

function newsletterRowToCampaign_(row, rowNumber) {
  const value = function (index) { return row[index] == null ? '' : row[index]; };
  return {
    rowNumber: rowNumber,
    campaignId: String(value(0)), created: value(1), updated: value(2), status: String(value(3)), title: String(value(4)),
    subject: String(value(5)), previewText: String(value(6)), audience: String(value(7)), fromName: String(value(8)),
    heroMessage: String(value(9)), heroCtaLabel: String(value(10)), heroCtaUrl: String(value(11)), featuredBookId: String(value(12)),
    featuredBookTitle: String(value(13)), featuredBookDescription: String(value(14)), featuredCtaLabel: String(value(15)), featuredCtaUrl: String(value(16)),
    quick1Title: String(value(17)), quick1Text: String(value(18)), quick1Url: String(value(19)), quick2Title: String(value(20)),
    quick2Text: String(value(21)), quick2Url: String(value(22)), closingNote: String(value(23)), sendDate: String(value(24)), sendTime: String(value(25)),
    timeZone: String(value(26)), scheduledAt: value(27), sentAt: value(28), recipients: value(29), sent: value(30), failed: value(31),
    lastError: String(value(32)), triggerId: String(value(33))
  };
}

function safeNewsletterUrl_(value) {
  const url = String(value || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
}

function newsletterRequireAdmin_() {
  if (!getAuthorizedAdminEmail_()) throw new Error('Admin access required.');
}
