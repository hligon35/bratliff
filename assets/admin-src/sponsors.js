  async function loadSponsors() {
    const params = new URLSearchParams();
    if (state.sponsorFilters.status) params.set("status", state.sponsorFilters.status);
    if (state.sponsorFilters.package) params.set("package", state.sponsorFilters.package);
    const query = params.toString();
    const data = await api("sponsors" + (query ? "?" + query : ""));
    state.sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
    renderSponsorList();
    if (state.selectedSponsorId) {
      const selected = state.sponsors.find(function (entry) {
        return entry.id === state.selectedSponsorId;
      });
      if (selected) populateSponsorForm(selected);
      else resetSponsorForm();
    }
  }

  function sponsorAvatarMarkup(row) {
    const label = row.anonymous ? "Anonymous" : (row.displayName || row.payerName || row.id || "Sponsor");
    const initials = label.split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
    if (!row.anonymous && row.logoUrl) {
      return '<span class="sponsor-avatar"><img src="' + escapeHtml(row.logoUrl) + '" alt=""></span>';
    }
    return '<span class="sponsor-avatar sponsor-avatar-fallback" aria-hidden="true">' + escapeHtml(row.anonymous ? "A" : initials) + "</span>";
  }

  function renderSponsorList() {
    const packageLabels = {
      pagePal: "Page Pal",
      chapterChampion: "Chapter Champion",
      bookshelfBuilder: "Bookshelf Builder",
      literacyTrailblazer: "Literacy Trailblazer",
    };
    const markup = selectableTableMarkup(
      "sponsors",
      [
        { label: "Sponsor", render: function (row) { return sponsorAvatarMarkup(row) + '<span class="sponsor-list-name">' + escapeHtml(row.anonymous ? "Anonymous" : (row.displayName || row.payerName || row.id)) + "</span>"; } },
        { label: "Package", render: function (row) { return escapeHtml(packageLabels[row.package] || row.package); } },
        { label: "Books", key: "booksSponsored" },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.recognitionStatus) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            const label = row.anonymous ? "Anonymous sponsor" : (row.displayName || row.payerName || row.id);
            return '<span class="table-action-buttons">' +
              '<button class="btn alt" type="button" data-edit-sponsor="' + escapeHtml(row.id) + '">View</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-sponsor="' + escapeHtml(row.id) + '" data-icon="delete" aria-label="Delete ' + escapeHtml(label) + '" title="Delete ' + escapeHtml(label) + '"></button>' +
              '</span>';
          },
        },
      ],
      state.sponsors,
      "No sponsors match these filters.",
      function (row) { return row.id; },
      function (row) { return row.anonymous ? "Anonymous sponsor" : (row.displayName || row.payerName || row.id); },
      "sponsors",
      true,
    );
    const list = qs("#sponsorList");
    if (list) list.innerHTML = markup;
  }

  function resetSponsorForm() {
    state.selectedSponsorId = "";
    const title = qs("#sponsorFormTitle");
    if (title) title.textContent = "Sponsor Details";
    const summary = qs("#sponsorDetailSummary");
    if (summary) summary.innerHTML = '<div class="sponsor-detail-empty">Select a sponsor to review their recognition details.</div>';
    const logo = qs("#sponsorLogoDisplay");
    if (logo) logo.innerHTML = "<span>No logo submitted</span>";
    setStatus("#sponsorStatus", "", null);
  }

  async function deleteSponsorRow(sponsorId) {
    const sponsor = state.sponsors.find(function (entry) {
      return entry.id === sponsorId;
    });
    const label = sponsor ? sponsor.displayName || sponsor.payerName || sponsorId : "this sponsor";
    if (!window.confirm("Delete " + label + "? This can't be undone.")) return;
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId), { method: "DELETE" });
      if (state.selectedSponsorId === sponsorId) resetSponsorForm();
      await loadSponsors();
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be deleted.", false);
    }
  }

  function populateSponsorForm(sponsor) {
    if (!sponsor) return;
    state.selectedSponsorId = sponsor.id || "";
    const packageLabels = {
      pagePal: "Page Pal",
      chapterChampion: "Chapter Champion",
      bookshelfBuilder: "Bookshelf Builder",
      literacyTrailblazer: "Literacy Trailblazer",
    };
    const recognitionName = sponsor.anonymous ? "Anonymous sponsor" : (sponsor.displayName || "Not provided");
    const website = sponsor.websiteUrl
      ? '<a href="' + escapeHtml(sponsor.websiteUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(sponsor.websiteUrl) + "</a>"
      : "Not provided";
    const detail = qs("#sponsorDetailSummary");
    if (detail) {
      detail.innerHTML =
        '<div class="sponsor-detail-status"><span class="badge">' + escapeHtml(sponsor.recognitionStatus || "Awaiting Payment") + "</span></div>" +
        '<dl class="sponsor-detail-grid">' +
        '<div><dt>Sponsor</dt><dd>' + escapeHtml(recognitionName) + "</dd></div>" +
        '<div><dt>Package</dt><dd>' + escapeHtml(packageLabels[sponsor.package] || sponsor.package || "—") + "</dd></div>" +
        '<div><dt>Payer name</dt><dd>' + escapeHtml(sponsor.payerName || "—") + "</dd></div>" +
        '<div><dt>Payer email</dt><dd><a href="mailto:' + escapeHtml(sponsor.payerEmail || "") + '">' + escapeHtml(sponsor.payerEmail || "—") + "</a></dd></div>" +
        '<div><dt>Books sponsored</dt><dd>' + escapeHtml(String(sponsor.booksSponsored || 0)) + "</dd></div>" +
        '<div><dt>Amount</dt><dd>' + (Number(sponsor.amountPaidCents || 0) ? escapeHtml(formatMoney(Number(sponsor.amountPaidCents || 0) / 100)) : "Pending payment") + "</dd></div>" +
        '<div><dt>Entity type</dt><dd>' + escapeHtml(sponsor.entityType || "Individual") + "</dd></div>" +
        '<div><dt>Website</dt><dd>' + website + "</dd></div>" +
        '<div><dt>Public recognition</dt><dd>' + escapeHtml(sponsor.anonymous ? "Anonymous" : (sponsor.displayName || "Not provided")) + "</dd></div>" +
        '<div><dt>Permission to publish</dt><dd>' + escapeHtml(sponsor.publishPermission ? "Granted" : "Not granted") + "</dd></div>" +
        '<div class="sponsor-detail-wide"><dt>Admin notes</dt><dd>' + escapeHtml(sponsor.adminNotes || "No internal notes.") + "</dd></div>" +
        "</dl>";
    }
    const logo = qs("#sponsorLogoDisplay");
    if (logo) {
      logo.innerHTML = sponsor.logoUrl
        ? '<img src="' + escapeHtml(sponsor.logoUrl) + '" alt="' + escapeHtml(sponsor.logoAlt || recognitionName) + '">'
        : "<span>No logo submitted</span>";
    }
    const title = qs("#sponsorFormTitle");
    if (title) title.textContent = "Sponsor Details";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function publishCurrentSponsor() {
    const sponsorId = state.selectedSponsorId;
    if (!sponsorId) {
      window.alert("Save the sponsor first.");
      return;
    }
    setStatus("#sponsorStatus", "Publishing...", null);
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId) + "/publish", { method: "POST" });
      await loadSponsors();
      const sponsor = state.sponsors.find(function (entry) {
        return entry.id === sponsorId;
      });
      if (sponsor) populateSponsorForm(sponsor);
      setStatus("#sponsorStatus", "Published.", true);
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be published.", false);
    }
  }

  async function hideCurrentSponsor() {
    const sponsorId = state.selectedSponsorId;
    if (!sponsorId) return;
    setStatus("#sponsorStatus", "Hiding...", null);
    try {
      await api("sponsors/" + encodeURIComponent(sponsorId) + "/hide", { method: "POST" });
      await loadSponsors();
      const sponsor = state.sponsors.find(function (entry) {
        return entry.id === sponsorId;
      });
      if (sponsor) populateSponsorForm(sponsor);
      setStatus("#sponsorStatus", "Hidden.", true);
    } catch (error) {
      setStatus("#sponsorStatus", error.message || "Sponsor could not be hidden.", false);
    }
  }


   qs("#publishSponsorBtn")?.addEventListener("click", publishCurrentSponsor);
  qs("#hideSponsorBtn")?.addEventListener("click", hideCurrentSponsor);
  qs("#sponsorsStatusFilter")?.addEventListener("change", function (event) {
    state.sponsorFilters.status = event.target.value || "";
    loadSponsors().catch(function (error) {
      setStatus("#sponsorStatus", error.message || "Sponsors could not be loaded.", false);
    });
  });
  qs("#sponsorsPackageFilter")?.addEventListener("change", function (event) {
    state.sponsorFilters.package = event.target.value || "";
    loadSponsors().catch(function (error) {
      setStatus("#sponsorStatus", error.message || "Sponsors could not be loaded.", false);
    });
  });

document.addEventListener("click", function (event) {
    const editSponsorButton = event.target.closest("[data-edit-sponsor]");
    if (editSponsorButton) {
      populateSponsorForm(
        state.sponsors.find(function (sponsor) {
          return sponsor.id === editSponsorButton.getAttribute("data-edit-sponsor");
        }),
      );
      return;
    }

    const deleteSponsorButton = event.target.closest("[data-delete-sponsor]");
    if (deleteSponsorButton) {
      deleteSponsorRow(deleteSponsorButton.getAttribute("data-delete-sponsor"));
      return;
    }
});


bulkConfigs.sponsors = {
  singular: "sponsor",
  plural: "sponsors",
  endpoint: function (id) { return "sponsors/" + encodeURIComponent(id); },
  load: loadSponsors,
  status: "#sponsorStatus",
  note: "This cannot be undone.",
};
pageLoaders.sponsors = loadSponsors;