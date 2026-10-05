  async function loadAuthors() {
    const params = new URLSearchParams();
    if (state.authorFilters.status) params.set("status", state.authorFilters.status);
    const query = params.toString();
    const data = await api("authors" + (query ? "?" + query : ""));
    state.authors = Array.isArray(data.authors) ? data.authors : [];
    renderAuthorList();
  }

  function renderAuthorList() {
    const markup = selectableTableMarkup(
      "authors",
      [
        { label: "Author", render: function (row) { return escapeHtml(row.name || row.id); } },
        { label: "Title", render: function (row) { return escapeHtml(row.title || "—"); } },
        { label: "Status", render: function (row) { return '<span class="badge">' + escapeHtml(row.status) + "</span>"; } },
        {
          label: "",
          render: function (row) {
            const label = row.name || row.id;
            return '<span class="table-action-buttons">' +
              '<button class="btn alt" type="button" data-edit-author="' + escapeHtml(row.id) + '">Edit</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-author="' + escapeHtml(row.id) + '" data-icon="delete" aria-label="Delete ' + escapeHtml(label) + '" title="Delete ' + escapeHtml(label) + '"></button>' +
              '</span>';
          },
        },
      ],
      state.authors,
      "No authors yet. Create one below.",
      function (row) { return row.id; },
      function (row) { return row.name || row.id; },
      "authors",
      true,
    );
    const list = qs("#authorList");
    if (list) list.innerHTML = markup;
  }

  function resetAuthorForm() {
    const form = qs("#authorForm");
    if (!form) return;
    form.reset();
    const authorIdField = field(form, "authorId");
    if (authorIdField) authorIdField.value = "";
    const title = qs("#authorFormTitle");
    if (title) title.textContent = "New Author";
    const portraitPreview = qs("#authorPortraitPreview");
    if (portraitPreview) portraitPreview.innerHTML = "<span>No author image</span>";
    const bookPreview = qs("#authorBookImagePreview");
    if (bookPreview) bookPreview.innerHTML = "<span>No book image</span>";
    setStatus("#authorStatus", "", null);
  }

  async function deleteAuthorRow(authorId) {
    const author = state.authors.find(function (entry) { return entry.id === authorId; });
    const label = author ? author.name || authorId : "this author";
    if (!window.confirm("Delete " + label + "? This can't be undone.")) return;
    try {
      await api("authors/" + encodeURIComponent(authorId), { method: "DELETE" });
      const form = qs("#authorForm");
      if (form && safeValue(field(form, "authorId")) === authorId) resetAuthorForm();
      await loadAuthors();
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be deleted.", false);
    }
  }


  function populateAuthorForm(author) {
    const form = qs("#authorForm");
    if (!form || !author) return;
    [["authorId", "id"], ["name", "name"], ["title", "title"], ["biography", "biography"], ["websiteUrl", "websiteUrl"], ["startAt", "startAt"], ["endAt", "endAt"]].forEach(function (pair) {
      const control = field(form, pair[0]);
      if (control) control.value = author[pair[1]] == null ? "" : author[pair[1]];
    });
    let links = {};
    try {
      const parsed = JSON.parse(author.socialLinks || "{}");
      if (Array.isArray(parsed)) {
        parsed.forEach(function (url) {
          const value = String(url || "");
          const key = /instagram/i.test(value) ? "instagram" : /linkedin/i.test(value) ? "linkedin" : /tiktok/i.test(value) ? "tiktok" : /youtube/i.test(value) ? "youtube" : "facebook";
          if (!links[key]) links[key] = value;
        });
      } else if (parsed && typeof parsed === "object") {
        links = parsed;
      }
    } catch {}
    [["facebook", "authorFacebook"], ["instagram", "authorInstagram"], ["linkedin", "authorLinkedIn"], ["tiktok", "authorTikTok"], ["youtube", "authorYouTube"]].forEach(function (pair) {
      const control = qs("#" + pair[1]);
      if (control) control.value = links[pair[0]] || "";
    });
    const title = qs("#authorFormTitle");
    if (title) title.textContent = "Edit Author";
    const portraitPreview = qs("#authorPortraitPreview");
    if (portraitPreview) portraitPreview.innerHTML = author.portraitUrl ? '<img src="' + escapeHtml(author.portraitUrl) + '" alt="">' : "<span>No author image</span>";
    const bookPreview = qs("#authorBookImagePreview");
    if (bookPreview) bookPreview.innerHTML = author.bookImageUrl ? '<img src="' + escapeHtml(author.bookImageUrl) + '" alt="">' : "<span>No book image</span>";
    const statusPill = qs("#authorStatusPill");
    if (statusPill) statusPill.textContent = author.status || "Draft";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function authorPayload() {
    const form = qs("#authorForm");
    if (!form) return {};
    const payload = {};
    [["authorId", "authorId"], ["name", "name"], ["title", "title"], ["biography", "biography"], ["websiteUrl", "websiteUrl"], ["startAt", "startAt"], ["endAt", "endAt"]].forEach(function (pair) {
      payload[pair[0]] = safeValue(field(form, pair[1]));
    });
    payload.socialLinks = JSON.stringify({
      facebook: safeValue(qs("#authorFacebook")),
      instagram: safeValue(qs("#authorInstagram")),
      linkedin: safeValue(qs("#authorLinkedIn")),
      tiktok: safeValue(qs("#authorTikTok")),
      youtube: safeValue(qs("#authorYouTube")),
    });
    return payload;
  }

  async function saveAuthor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setStatus("#authorStatus", "Saving...", null);
    try {
      const data = await api("authors", { method: "POST", body: authorPayload() });
      let author = data.author;
      const portraitInput = qs("#authorPortrait");
      const bookInput = qs("#authorBookImage");
      const portraitFile = portraitInput && portraitInput.files ? portraitInput.files[0] : null;
      const bookFile = bookInput && bookInput.files ? bookInput.files[0] : null;
      if (author && author.id && portraitFile) {
        const upload = new FormData();
        upload.set("file", portraitFile);
        await api("authors/" + encodeURIComponent(author.id) + "/portrait", { method: "POST", body: upload });
      }
      if (author && author.id && bookFile) {
        const upload = new FormData();
        upload.set("file", bookFile);
        await api("authors/" + encodeURIComponent(author.id) + "/book-image", { method: "POST", body: upload });
      }
      await loadAuthors();
      author = state.authors.find(function (entry) { return entry.id === (author && author.id); }) || author;
      if (author) populateAuthorForm(author);
      if (portraitInput) portraitInput.value = "";
      if (bookInput) bookInput.value = "";
      setStatus("#authorStatus", "Saved.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be saved.", false);
    }
  }

  async function publishCurrentAuthor() {
    const form = qs("#authorForm");
    const authorId = form ? safeValue(field(form, "authorId")) : "";
    if (!authorId) {
      window.alert("Save the author first.");
      return;
    }
    setStatus("#authorStatus", "Publishing...", null);
    try {
      await api("authors/" + encodeURIComponent(authorId) + "/publish", { method: "POST" });
      await loadAuthors();
      const author = state.authors.find(function (entry) {
        return entry.id === authorId;
      });
      if (author) populateAuthorForm(author);
      setStatus("#authorStatus", "Published to the Media page spotlight.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be published.", false);
    }
  }

  async function hideCurrentAuthor() {
    const form = qs("#authorForm");
    const authorId = form ? safeValue(field(form, "authorId")) : "";
    if (!authorId) return;
    setStatus("#authorStatus", "Hiding...", null);
    try {
      await api("authors/" + encodeURIComponent(authorId) + "/hide", { method: "POST" });
      await loadAuthors();
      const author = state.authors.find(function (entry) {
        return entry.id === authorId;
      });
      if (author) populateAuthorForm(author);
      setStatus("#authorStatus", "Hidden.", true);
    } catch (error) {
      setStatus("#authorStatus", error.message || "Author could not be hidden.", false);
    }
  }


  qs("#authorForm")?.addEventListener("submit", saveAuthor);
  qs("#newAuthorBtn")?.addEventListener("click", resetAuthorForm);
  qs("#publishAuthorBtn")?.addEventListener("click", publishCurrentAuthor);
  qs("#hideAuthorBtn")?.addEventListener("click", hideCurrentAuthor);
  qs("#authorStatusFilter")?.addEventListener("change", function (event) {
    state.authorFilters.status = event.target.value || "";
    loadAuthors().catch(function (error) {
      setStatus("#authorStatus", error.message || "Authors could not be loaded.", false);
    });
  });
  qs("#authorBookImage")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#authorBookImagePreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });

  qs("#authorPortrait")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#authorPortraitPreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });

document.addEventListener("click", function (event) {
    const editAuthorButton = event.target.closest("[data-edit-author]");
    if (editAuthorButton) {
      populateAuthorForm(
        state.authors.find(function (author) {
          return author.id === editAuthorButton.getAttribute("data-edit-author");
        }),
      );
      return;
    }

    const deleteAuthorButton = event.target.closest("[data-delete-author]");
    if (deleteAuthorButton) {
      deleteAuthorRow(deleteAuthorButton.getAttribute("data-delete-author"));
      return;
    }
});


bulkConfigs.authors = {
  singular: "author",
  plural: "authors",
  endpoint: function (id) { return "authors/" + encodeURIComponent(id); },
  load: loadAuthors,
  status: "#authorStatus",
  note: "This cannot be undone.",
};
pageLoaders.author = loadAuthors;