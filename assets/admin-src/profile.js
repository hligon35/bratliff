  function renderAdmins() {
    const form = qs("#adminForm");
    const canDelete = Boolean(state.viewer && state.viewer.role === "owner");
    if (form) form.hidden = !canDelete;
    const addButton = qs("#openAdminFormBtn");
    if (addButton) addButton.hidden = !canDelete;
    const root = qs("#adminList");
    if (!root) return;
    root.innerHTML = selectableTableMarkup(
      "admins",
      [
        { label: "Name", render: function (row) { return escapeHtml(row.name || row.displayName || "—"); } },
        { label: "Email", key: "email" },
        { label: "Role", render: function (row) { return '<span class="badge">' + escapeHtml(row.role || "") + "</span>"; } },
        { label: "Display Name", key: "displayName" },
        { label: "Access", render: function (row) {
          const access = {
            owner: "Full admin access; manages permissions",
            developer: "Admin tools, analytics and logs; cannot change permissions",
            manager: "Admin tools; no analytics, logs or access management",
          };
          return escapeHtml(access[row.role] || "Unknown role");
        } },
        {
          label: "Actions",
          render: function (row) {
            return canDelete
              ? '<button class="btn alt icon-only" type="button" data-remove-admin="' + escapeHtml(row.email) + '" data-icon="delete" aria-label="Remove admin access for ' + escapeHtml(row.email) + '" title="Remove admin access for ' + escapeHtml(row.email) + '"></button>'
              : '<span class="asset-note" title="Only owners can change admin access" aria-label="Only owners can change admin access">—</span>';
          },
        },
      ],
      state.admins,
      "No admin users found.",
      function (row) { return row.email; },
      function (row) { return row.email; },
      "admins",
      canDelete,
    );
  }


  async function loadAdmins() {
    const data = await api("admins");
    state.admins = Array.isArray(data.admins) ? data.admins : [];
    renderAdmins();
  }

  async function saveAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setStatus("#adminStatus", "Saving...", null);
    try {
      await api("admins", {
        method: "POST",
        body: {
          email: safeValue(field(form, "email")),
          displayName: safeValue(field(form, "displayName")),
          role: safeValue(field(form, "role")),
        },
      });
      form.reset();
      await loadAdmins();
      setStatus("#adminStatus", "Admin saved.", true);
      qs("#adminFormDialog")?.close();
    } catch (error) {
      setStatus("#adminStatus", error.message || "Admin could not be saved.", false);
    }
  }

  async function removeAdmin(email) {
    if (!window.confirm("Remove admin access for " + email + "?")) return;
    await api("admins/" + encodeURIComponent(email), { method: "DELETE" });
    await loadAdmins();
  }


  qs("#openAdminFormBtn")?.addEventListener("click", function () {
    if (!state.viewer || state.viewer.role !== "owner") return;
    qs("#adminFormDialog")?.showModal();
  });
  qs("#closeAdminFormBtn")?.addEventListener("click", function () { qs("#adminFormDialog")?.close(); });
  qs("#adminFormDialog")?.addEventListener("click", function (event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  qs("#adminForm")?.addEventListener("submit", saveAdmin);

document.addEventListener("click", function (event) {
    const removeAdminButton = event.target.closest("[data-remove-admin]");
    if (removeAdminButton) {
      removeAdmin(removeAdminButton.getAttribute("data-remove-admin")).catch(function (error) {
        setStatus("#adminStatus", error.message || "Admin could not be removed.", false);
      });
      return;
    }
});


bulkConfigs.admins = {
  singular: "admin account",
  plural: "admin accounts",
  endpoint: function (id) { return "admins/" + encodeURIComponent(id); },
  load: loadAdmins,
  status: "#adminStatus",
  note: "This cannot be undone.",
};
pageLoaders.profile = loadAdmins;