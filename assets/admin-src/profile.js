  function canManageAdmins() {
    return String(state.viewer && state.viewer.role || "").toLowerCase() === "owner";
  }

  function renderAdminAccessControls() {
    const canManage = canManageAdmins();
    const form = qs("#adminForm");
    if (form) form.hidden = !canManage;
    const addButton = qs("#openAdminFormBtn");
    if (addButton) addButton.hidden = !canManage;
  }

  function renderAdmins() {
    const canManage = canManageAdmins();
    renderAdminAccessControls();
    const root = qs("#adminList");
    if (!root) return;
    root.innerHTML = tableMarkup("table", [
      { label: "Name", render: function (row) { return escapeHtml(row.name || [row.firstName, row.lastName].filter(Boolean).join(" ") || row.displayName || "—"); } },
      { label: "Email", key: "email" },
      { label: "Role", render: function (row) { return '<span class="badge">' + escapeHtml(row.role || "") + "</span>"; } },
      { label: "Access", render: function (row) {
        const access = { owner: "Full admin access; manages permissions", developer: "Admin tools, analytics and logs; cannot change permissions", manager: "Admin tools; no analytics, logs or access management" };
        return escapeHtml(access[row.role] || "Unknown role");
      } },
      { label: "Status", render: function (row) { return '<span class="badge ' + (row.status === "Pending" ? "gold" : "green") + '">' + escapeHtml(row.status || "Active") + "</span>"; } },
      { label: "Actions", render: function (row) {
        if (!canManage) return '<span class="asset-note" title="Only owners can change admin access">—</span>';
        const id = row.status === "Pending" ? row.invitationId : row.email;
        const editKey = row.status === "Pending" ? "invitationId" : "email";
        return '<span class="admin-access-actions"><button class="btn alt icon-only" type="button" data-edit-admin="' + escapeHtml(id) + '" data-edit-kind="' + editKey + '" data-icon="edit" aria-label="Edit access for ' + escapeHtml(row.email) + '" title="Edit access"></button><button class="btn alt icon-only" type="button" data-remove-admin="' + escapeHtml(id) + '" data-remove-kind="' + (row.status === "Pending" ? "invitation" : "admin") + '" data-icon="delete" aria-label="Remove access for ' + escapeHtml(row.email) + '" title="Remove access"></button></span>';
      } },
    ], state.admins, "No admin users found.");
  }

  async function loadAdmins() {
    // Make owner controls available after session verification, even if the list API fails.
    renderAdminAccessControls();
    const data = await api("admins");
    state.admins = Array.isArray(data.admins) ? data.admins : [];
    renderAdmins();
  }

  function resetAdminForm() {
    const form = qs("#adminForm");
    if (form) {
      form.reset();
      field(form, "recordId").value = "";
      field(form, "recordStatus").value = "";
      field(form, "email").readOnly = false;
      field(form, "email").removeAttribute("aria-readonly");
    }
    qs("#adminFormDialogTitle").textContent = "Invite administrator";
    qs("#saveAdminBtn").textContent = "Send invitation";
    setStatus("#adminStatus", "", null);
  }

  function openAdminEditor(row) {
    const form = qs("#adminForm");
    if (!form || !row) return;
    resetAdminForm();
    const fullName = String(row.name || "").trim().split(/\s+/);
    field(form, "firstName").value = row.firstName || fullName[0] || "";
    field(form, "lastName").value = row.lastName || fullName.slice(1).join(" ");
    field(form, "email").value = row.email || "";
    field(form, "role").value = row.role || "manager";
    field(form, "recordId").value = row.invitationId || row.email;
    field(form, "recordStatus").value = row.status || "Active";
    if (row.status !== "Pending") {
      field(form, "email").readOnly = true;
      field(form, "email").setAttribute("aria-readonly", "true");
    }
    qs("#adminFormDialogTitle").textContent = row.status === "Pending" ? "Edit pending invitation" : "Edit administrator";
    qs("#saveAdminBtn").textContent = row.status === "Pending" ? "Save and resend link" : "Save changes";
    qs("#adminFormDialog").showModal();
  }

  async function saveAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const email = safeValue(field(form, "email"));
    const firstName = safeValue(field(form, "firstName"));
    const lastName = safeValue(field(form, "lastName"));
    const role = safeValue(field(form, "role"));
    const recordId = safeValue(field(form, "recordId"));
    const status = safeValue(field(form, "recordStatus"));
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    setStatus("#adminStatus", status ? "Saving..." : "Sending invitation...", null);
    try {
      if (!status) {
        await api("admins", { method: "POST", body: { email, firstName, lastName, role } });
      } else if (status === "Pending") {
        await api("admin-invitations/" + encodeURIComponent(recordId), { method: "PUT", body: { email, firstName, lastName, role } });
      } else {
        await api("admins/" + encodeURIComponent(recordId), { method: "PUT", body: { firstName, lastName, name, role } });
      }
      await loadAdmins();
      const confirmation = status ? "Admin access updated." : "Invitation sent; status is pending.";
      const notice = qs("#workspaceNotice");
      if (notice) { notice.textContent = confirmation; notice.hidden = false; notice.classList.add("success"); }
      qs("#adminFormDialog")?.close();
      resetAdminForm();
    } catch (error) {
      setStatus("#adminStatus", error.message || "Admin access could not be saved.", false);
    }
  }

  async function removeAdmin(id, kind) {
    const label = kind === "invitation" ? "pending invitation" : "admin access";
    if (!window.confirm("Remove this " + label + "?")) return;
    const endpoint = kind === "invitation" ? "admin-invitations/" : "admins/";
    await api(endpoint + encodeURIComponent(id), { method: "DELETE" });
    await loadAdmins();
  }

  qs("#openAdminFormBtn")?.addEventListener("click", function () {
    if (!canManageAdmins()) {
      setStatus("#adminStatus", "Only an owner can send administrator invitations.", false);
      return;
    }
    const dialog = qs("#adminFormDialog");
    if (!dialog || typeof dialog.showModal !== "function") {
      setStatus("#adminStatus", "The administrator form could not be opened in this browser.", false);
      return;
    }
    resetAdminForm();
    dialog.showModal();
  });
  qs("#closeAdminFormBtn")?.addEventListener("click", function () { qs("#adminFormDialog")?.close(); });
  qs("#adminFormDialog")?.addEventListener("close", resetAdminForm);
  qs("#adminFormDialog")?.addEventListener("click", function (event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  qs("#adminForm")?.addEventListener("submit", saveAdmin);

document.addEventListener("click", function (event) {
    const editAdminButton = event.target.closest("[data-edit-admin]");
    if (editAdminButton) {
      const id = editAdminButton.getAttribute("data-edit-admin");
      const row = state.admins.find(function (item) { return (item.invitationId || item.email) === id; });
      openAdminEditor(row);
      return;
    }
    const removeAdminButton = event.target.closest("[data-remove-admin]");
    if (removeAdminButton) {
      removeAdmin(removeAdminButton.getAttribute("data-remove-admin"), removeAdminButton.getAttribute("data-remove-kind")).catch(function (error) {
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