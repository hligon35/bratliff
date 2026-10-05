  function setNewsletterSubscriberPill(value) {
    const pill = qs("#subscriberPill");
    if (!pill) return;
    const count = Number(value || 0);
    pill.textContent = count + " subscriber" + (count === 1 ? "" : "s");
  }


  function newsletterSelectedBook() {
    const id = safeValue(qs("#featuredBookId"));
    return state.newsletterBooks.find(function (book) {
      return book.bookId === id;
    }) || null;
  }

  function newsletterPayload() {
    const book = newsletterSelectedBook();
    return {
      campaignId: safeValue(qs("#campaignId")),
      title: safeValue(qs("#title")),
      subject: safeValue(qs("#subject")),
      previewText: safeValue(qs("#previewText")),
      audience: safeValue(qs("#audience")),
      targetType: safeValue(qs("#targetType")) || "all",
      targetValue: safeValue(qs("#targetType")) === "book_interest" ? safeValue(qs("#targetValue")) : "",
      fromName: safeValue(qs("#fromName")),
      heroMessage: safeValue(qs("#heroMessage")),
      heroCtaLabel: safeValue(qs("#heroCtaLabel")),
      heroCtaUrl: safeValue(qs("#heroCtaUrl")),
      featuredBookId: book ? book.bookId : "",
      featuredBookTitle: book ? book.title : "",
      featuredBookDescription: safeValue(qs("#featuredBookDescription")),
      featuredBookImageUrl: book ? book.imageUrl : "",
      featuredCtaLabel: safeValue(qs("#featuredCtaLabel")),
      featuredCtaUrl: safeValue(qs("#featuredCtaUrl")),
      quick1Title: safeValue(qs("#quick1Title")),
      quick1Text: safeValue(qs("#quick1Text")),
      quick1Url: safeValue(qs("#quick1Url")),
      quick2Title: safeValue(qs("#quick2Title")),
      quick2Text: safeValue(qs("#quick2Text")),
      quick2Url: safeValue(qs("#quick2Url")),
      closingNote: safeValue(qs("#closingNote")),
      sendDate: safeValue(qs("#sendDate")),
      sendTime: safeValue(qs("#sendTime")),
      timeZone: safeValue(qs("#timeZone")),
    };
  }

  function fillNewsletterDefaults(defaults) {
    Object.keys(defaults || {}).forEach(function (key) {
      const element = qs("#" + key);
      if (element) element.value = defaults[key] || "";
    });
    const campaignId = qs("#campaignId");
    if (campaignId) campaignId.value = "";
    toggleNewsletterTargetField();
  }

  function fillNewsletterCampaign(campaign) {
    [
      "campaignId",
      "title",
      "subject",
      "previewText",
      "audience",
      "targetType",
      "targetValue",
      "fromName",
      "heroMessage",
      "heroCtaLabel",
      "heroCtaUrl",
      "featuredBookId",
      "featuredBookDescription",
      "featuredCtaLabel",
      "featuredCtaUrl",
      "quick1Title",
      "quick1Text",
      "quick1Url",
      "quick2Title",
      "quick2Text",
      "quick2Url",
      "closingNote",
      "sendDate",
      "sendTime",
      "timeZone",
    ].forEach(function (key) {
      const element = qs("#" + key);
      if (element) element.value = campaign[key] || "";
    });
    toggleNewsletterTargetField();
    updateNewsletterPreview();
    window.scrollTo(0, 0);
  }

  function toggleNewsletterTargetField() {
    const targetType = safeValue(qs("#targetType")) || "all";
    const field = qs("#targetValueField");
    if (field) field.hidden = targetType !== "book_interest";
  }

  function campaignSavedLabel(campaign) {
    return formatDate(campaign.updated || campaign.created || "") || "—";
  }

  function campaignRecipientsLabel(campaign) {
    return campaign.recipients ? String(campaign.recipients) : "—";
  }

  function campaignScheduledLabel(campaign) {
    return formatDate(campaign.scheduledAt || "") || ((campaign.sendDate || campaign.sendTime) ? String(campaign.sendDate || "") + " " + String(campaign.sendTime || "") : "—");
  }

  function countWords(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  function updateNewsletterStats(payload, book) {
    const sections = [
      Boolean(payload.heroMessage || payload.heroCtaLabel || payload.heroCtaUrl),
      Boolean(book || payload.featuredBookDescription || payload.featuredCtaLabel || payload.featuredCtaUrl),
      Boolean(payload.quick1Title || payload.quick1Text || payload.quick1Url || payload.quick2Title || payload.quick2Text || payload.quick2Url),
      Boolean(payload.closingNote),
    ].filter(Boolean).length;
    const ctaCount = [
      payload.heroCtaUrl || payload.heroCtaLabel,
      payload.featuredCtaUrl || payload.featuredCtaLabel,
      payload.quick1Url,
      payload.quick2Url,
    ].filter(function (value) {
      return Boolean(String(value || "").trim());
    }).length;
    const estimatedWords =
      countWords(payload.title) +
      countWords(payload.subject) +
      countWords(payload.previewText) +
      countWords(payload.heroMessage) +
      countWords(book ? book.title : payload.featuredBookTitle) +
      countWords(book ? book.author : "") +
      countWords(payload.featuredBookDescription) +
      countWords(payload.quick1Title) +
      countWords(payload.quick1Text) +
      countWords(payload.quick2Title) +
      countWords(payload.quick2Text) +
      countWords(payload.closingNote);
    const sectionsNode = qs("#newsletterSectionsStat");
    const ctaNode = qs("#newsletterCtaStat");
    const wordsNode = qs("#newsletterWordsStat");
    const previewNode = qs("#newsletterPreviewStat");
    if (sectionsNode) sectionsNode.textContent = sections + "/4";
    if (ctaNode) ctaNode.textContent = String(ctaCount);
    if (wordsNode) wordsNode.textContent = estimatedWords + " / 425";
    if (previewNode) previewNode.textContent = qs("#emailWrap")?.classList.contains("mobile") ? "Mobile" : "Desktop";
  }

  function closeCampaignLibrary() {
    const overlay = qs("#campaignLibraryOverlay");
    if (overlay) overlay.hidden = true;
  }

  function openCampaignLibrary(kind) {
    const overlay = qs("#campaignLibraryOverlay");
    const title = qs("#campaignLibraryTitle");
    const body = qs("#campaignLibraryBody");
    if (!overlay || !title || !body) return;
    const scheduled = kind === "scheduled";
    const campaigns = state.campaigns.filter(function (campaign) {
      return scheduled ? campaign.status === "Scheduled" : campaign.status === "Draft";
    });
    title.textContent = scheduled ? "Scheduled Newsletters" : "Draft Newsletters";
    if (!campaigns.length) {
      body.innerHTML = '<div class="empty">No ' + (scheduled ? 'scheduled newsletters' : 'drafts') + ' yet.</div>';
    } else {
      body.innerHTML = '<table class="campaign-library-table"><thead><tr><th>' +
        (scheduled ? 'Saved' : 'Saved') +
        '</th><th>Title</th><th>Recipients</th>' +
        (scheduled ? '<th>Scheduled Time</th>' : '') +
        '<th></th></tr></thead><tbody>' + campaigns.map(function (campaign) {
          return '<tr><td>' + escapeHtml(campaignSavedLabel(campaign)) + '</td><td><strong>' + escapeHtml(campaign.title || campaign.subject || 'Untitled') + '</strong><div class="campaign-library-meta">' + escapeHtml(campaign.subject || '') + '</div></td><td>' + escapeHtml(campaignRecipientsLabel(campaign)) + '</td>' + (scheduled ? '<td>' + escapeHtml(campaignScheduledLabel(campaign)) + '</td>' : '') + '<td><button class="nl-btn secondary" type="button" data-open-campaign="' + escapeHtml(campaign.campaignId) + '">Open</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
    overlay.hidden = false;
  }

  function updateNewsletterPreview() {
    const preview = qs("#preview");
    if (!preview) return;
    const payload = newsletterPayload();
    const book = newsletterSelectedBook();
    preview.innerHTML =
      '<div class="nl-email-header"><div class="nl-email-brand"><img class="nl-logo" src="assets/icons/jrppLogo2.png" alt="Jackrabbit Punkin Publishing"><div><h3>Jackrabbit Punkin Publishing</h3><p>Stories That Inspire. Books That Endure.</p></div></div></div>' +
      '<section class="nl-email-hero"><div class="nl-kicker">' +
      escapeHtml(payload.title || "The Jackrabbit Journal") +
      "</div><h1>" +
      escapeHtml(payload.subject || "Your newsletter subject") +
      "</h1><p>" +
      escapeHtml(payload.heroMessage || "") +
      "</p>" +
      (payload.heroCtaLabel ? '<a class="nl-cta" href="#">' + escapeHtml(payload.heroCtaLabel) + "</a>" : "") +
      "</section>" +
      (book
        ? '<section class="nl-email-section nl-feature"><div class="nl-book-cover">' +
          (book.imageUrl ? '<img src="' + escapeHtml(book.imageUrl) + '" alt="">' : escapeHtml(book.title)) +
          '</div><div><div class="nl-kicker">Featured title</div><h3>' +
          escapeHtml(book.title) +
          '</h3><div class="nl-meta">' +
          escapeHtml([book.author, book.category].filter(Boolean).join(" · ")) +
          "</div><p>" +
          escapeHtml(payload.featuredBookDescription || book.shortDescription || "") +
          "</p>" +
          (payload.featuredCtaLabel
            ? '<a href="#" style="display:inline-block;margin-top:12px;color:#542476;font-weight:700;text-decoration:none">' +
              escapeHtml(payload.featuredCtaLabel) +
              " →</a>"
            : "") +
          "</div></section>"
        : "") +
      '<section class="nl-email-section"><div class="nl-kicker">Quick updates</div><h2>A few things worth knowing</h2><div class="nl-mini-grid"><div class="nl-mini-card"><strong>' +
      escapeHtml(payload.quick1Title) +
      "</strong><p>" +
      escapeHtml(payload.quick1Text) +
      '</p></div><div class="nl-mini-card"><strong>' +
      escapeHtml(payload.quick2Title) +
      "</strong><p>" +
      escapeHtml(payload.quick2Text) +
      '</p></div></div></section><section class="nl-signoff"><p style="margin:0 0 10px;color:#4e596c;line-height:1.65">' +
      escapeHtml(payload.closingNote) +
      '</p><strong>— Jackrabbit Punkin Publishing LLC</strong></section><footer class="nl-footer"><b>Jackrabbit Punkin Publishing LLC</b><br>Stories That Inspire. Books That Endure.<br>Manage preferences · Unsubscribe</footer>';
    updateNewsletterStats(payload, book);
  }

  function renderSubscribers() {
    const root = qs("#subscriberList");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "Email", key: "email" },
        { label: "Status", key: "status" },
        { label: "Consent", render: function (row) { return row.consent ? "Yes" : "No"; } },
        { label: "Last Seen", render: function (row) { return escapeHtml(formatDate(row.lastSeenAt)); } },
      ],
      state.subscribers.slice(0, 200),
      "No subscribers yet.",
    );
  }

  function renderCampaigns() {
    const root = qs("#campaignList");
    if (!root) return;
    if (!state.campaigns.length) {
      root.innerHTML = '<div class="nl-muted">No saved campaigns yet.</div>';
      return;
    }
    const campaigns = state.campaigns.slice().sort(function (left, right) {
      return asTime(right.updated || right.created) - asTime(left.updated || left.created);
    });
    root.innerHTML =
      "<table><thead><tr><th>Campaign</th><th>Status</th><th>Delivery</th><th>Sent</th><th></th></tr></thead><tbody>" +
      campaigns
        .map(function (campaign) {
          const delivery = campaign.status === "Scheduled"
            ? campaignScheduledLabel(campaign)
            : ((campaign.sendDate || campaign.sendTime)
              ? String(campaign.sendDate || "") + " " + String(campaign.sendTime || "")
              : campaignSavedLabel(campaign));
          return (
            "<tr><td><b>" +
            escapeHtml(campaign.title || campaign.subject) +
            "</b><br><small>" +
            escapeHtml(campaign.subject || "") +
            "</small></td><td>" +
            escapeHtml(campaign.status || "") +
            "</td><td>" +
            escapeHtml(delivery) +
            "</td><td>" +
            escapeHtml(String(campaign.sent || "")) +
            "/" +
            escapeHtml(String(campaign.recipients || "")) +
            '</td><td><button class="nl-btn secondary" type="button" data-open-campaign="' +
            escapeHtml(campaign.campaignId) +
            '">Open</button>' +
            (campaign.status === "Scheduled"
              ? '<button class="nl-btn danger" type="button" style="margin-left:6px" data-cancel-campaign="' + escapeHtml(campaign.campaignId) + '">Cancel</button>'
              : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  }


  async function loadNewsletter() {
    const wantsSubscribers = Boolean(qs("#subscriberList"));
    const stateData = await api("newsletter/state");
    const subscribersData = wantsSubscribers ? await api("newsletter/subscribers") : { subscribers: [] };
    state.campaigns = Array.isArray(stateData.campaigns) ? stateData.campaigns : [];
    state.newsletterBooks = Array.isArray(stateData.books) ? stateData.books : [];
    state.bookBuzzTargets = Array.isArray(stateData.bookBuzzTargets) ? stateData.bookBuzzTargets : [];
    state.newsletterDefaults = stateData.defaults || {};
    state.subscriberCount = Number(stateData.subscriberCount || 0);
    state.adminEmail = String(stateData.adminEmail || state.adminEmail || "");
    state.subscribers = Array.isArray(subscribersData.subscribers) ? subscribersData.subscribers : [];
    setNewsletterSubscriberPill(state.subscriberCount);
    const featuredBook = qs("#featuredBookId");
    if (featuredBook) {
      const current = featuredBook.value;
      featuredBook.innerHTML = '<option value="">None</option>' + state.newsletterBooks
        .map(function (book) {
          return '<option value="' + escapeHtml(book.bookId) + '">' + escapeHtml(book.title) + "</option>";
        })
        .join("");
      if (current) featuredBook.value = current;
    }
    const targetValueSelect = qs("#targetValue");
    if (targetValueSelect) {
      const current = targetValueSelect.value;
      targetValueSelect.innerHTML = '<option value="">Select a title</option>' + state.bookBuzzTargets
        .map(function (target) {
          return '<option value="' + escapeHtml(target.title) + '">' + escapeHtml(target.title) + " (" + Number(target.signups || 0) + " signups)</option>";
        })
        .join("");
      if (current) targetValueSelect.value = current;
    }
    toggleNewsletterTargetField();
    if (!safeValue(qs("#subject"))) fillNewsletterDefaults(state.newsletterDefaults);
    renderCampaigns();
    renderSubscribers();
    updateNewsletterPreview();
  }


  async function saveNewsletterDraft() {
    try {
      setStatus("#status", "Saving draft...", null);
      const payload = newsletterPayload();
      payload.status = "Draft";
      const data = await api("newsletter/campaigns", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId) campaignId.value = data.campaign && data.campaign.campaignId ? data.campaign.campaignId : "";
      await loadNewsletter();
      setStatus("#status", "Draft saved.", true);
    } catch (error) {
      setStatus("#status", error.message || "Draft could not be saved.", false);
    }
  }

  async function sendNewsletterTest() {
    const email = window.prompt("Send a test to which email address?", state.adminEmail || "");
    if (!email) return;
    try {
      setStatus("#status", "Sending test...", null);
      const payload = newsletterPayload();
      payload.testEmail = email;
      const data = await api("newsletter/test", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId && data.campaignId) campaignId.value = data.campaignId;
      await loadNewsletter();
      setStatus("#status", data.message || ("Test email sent to " + email + "."), true);
    } catch (error) {
      setStatus("#status", error.message || "Test email could not be sent.", false);
    }
  }

  async function scheduleNewsletter() {
    const payload = newsletterPayload();
    const shouldSchedule = Boolean(payload.sendDate || payload.sendTime);
    const prompt = shouldSchedule
      ? "Schedule this newsletter using the selected date, time, and time zone?"
      : "No delivery date is set. Send this newsletter now to all active subscribers?";
    if (!window.confirm(prompt)) return;
    try {
      if (shouldSchedule) {
        setStatus("#status", "Scheduling...", null);
        payload.status = "Scheduled";
        const data = await api("newsletter/campaigns", { method: "POST", body: payload });
        const campaignId = qs("#campaignId");
        if (campaignId && data.campaign && data.campaign.campaignId) campaignId.value = data.campaign.campaignId;
        await loadNewsletter();
        setStatus("#status", "Newsletter scheduled.", true);
        return;
      }
      setStatus("#status", "Sending newsletter...", null);
      const sendResult = await api("newsletter/send", { method: "POST", body: payload });
      const campaignId = qs("#campaignId");
      if (campaignId && sendResult.campaignId) campaignId.value = sendResult.campaignId;
      await loadNewsletter();
      setStatus("#status", sendResult.message || "Newsletter sent.", true);
    } catch (error) {
      setStatus("#status", error.message || "Newsletter could not be scheduled.", false);
    }
  }

  async function cancelNewsletterSchedule(campaignId) {
    try {
      setStatus("#status", "Cancelling schedule...", null);
      await api("newsletter/campaigns/" + encodeURIComponent(campaignId) + "/cancel", { method: "POST" });
      await loadNewsletter();
      setStatus("#status", "Schedule cancelled.", true);
    } catch (error) {
      setStatus("#status", error.message || "Schedule could not be cancelled.", false);
    }
  }


  qs("#draftsBtn")?.addEventListener("click", function () {
    openCampaignLibrary("drafts");
  });
  qs("#scheduledBtn")?.addEventListener("click", function () {
    openCampaignLibrary("scheduled");
  });
  qs("#newBtn")?.addEventListener("click", function () {
    fillNewsletterDefaults(state.newsletterDefaults);
    setStatus("#status", "", null);
    updateNewsletterPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  qs("#closeCampaignLibraryBtn")?.addEventListener("click", closeCampaignLibrary);
  qs("#saveBtn")?.addEventListener("click", saveNewsletterDraft);
  qs("#testBtn")?.addEventListener("click", sendNewsletterTest);
  qs("#scheduleBtn")?.addEventListener("click", scheduleNewsletter);
  qs("#desktopPreviewBtn")?.addEventListener("click", function () {
    qs("#emailWrap")?.classList.remove("mobile");
    qs("#desktopPreviewBtn")?.classList.add("active");
    qs("#mobilePreviewBtn")?.classList.remove("active");
    const pill = qs("#previewModePill");
    if (pill) pill.textContent = "Desktop";
    updateNewsletterStats(newsletterPayload(), newsletterSelectedBook());
  });
  qs("#mobilePreviewBtn")?.addEventListener("click", function () {
    qs("#emailWrap")?.classList.add("mobile");
    qs("#mobilePreviewBtn")?.classList.add("active");
    qs("#desktopPreviewBtn")?.classList.remove("active");
    const pill = qs("#previewModePill");
    if (pill) pill.textContent = "Mobile";
    updateNewsletterStats(newsletterPayload(), newsletterSelectedBook());
  });

  qsa("#newsletterAdminRoot input,#newsletterAdminRoot textarea,#newsletterAdminRoot select").forEach(function (element) {
    element.addEventListener("input", updateNewsletterPreview);
    element.addEventListener("change", function () {
      if (element.id === "featuredBookId") {
        const book = newsletterSelectedBook();
        const description = qs("#featuredBookDescription");
        if (book && description && !description.value) description.value = book.shortDescription || "";
      }
      if (element.id === "targetType") {
        toggleNewsletterTargetField();
      }
      updateNewsletterPreview();
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeCampaignLibrary();
  });

document.addEventListener("click", function (event) {
    const openCampaignButton = event.target.closest("[data-open-campaign]");
    if (openCampaignButton) {
      const campaign = state.campaigns.find(function (entry) {
        return entry.campaignId === openCampaignButton.getAttribute("data-open-campaign");
      });
      if (campaign) {
        fillNewsletterCampaign(campaign);
        closeCampaignLibrary();
      }
      return;
    }

    const cancelCampaignButton = event.target.closest("[data-cancel-campaign]");
    if (cancelCampaignButton) {
      cancelNewsletterSchedule(cancelCampaignButton.getAttribute("data-cancel-campaign"));
      return;
    }

    if (event.target === qs("#campaignLibraryOverlay")) {
      closeCampaignLibrary();
    }
});


pageLoaders.newsletter = loadNewsletter;
