  async function loadSettings() {
    const data = await api("me");
    state.viewer = data.viewer || state.viewer;
    const form = qs("#settingsForm");
    if (form && state.viewer) {
      const displayName = field(form, "displayName");
      const name = field(form, "name");
      const email = field(form, "email");
      if (displayName) displayName.value = state.viewer.displayName || "";
      if (name) name.value = state.viewer.name || state.viewer.displayName || "";
      if (email) email.value = state.viewer.email || "";
    }
    const preview = qs("#settingsAvatarPreview");
    if (preview) preview.innerHTML = state.viewer && state.viewer.avatarUrl
      ? '<img src="' + escapeHtml(state.viewer.avatarUrl) + '" alt="">'
      : "<span>No avatar</span>";
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setStatus("#settingsStatus", "Saving...", null);
    try {
      const data = await api("me", {
        method: "PUT",
        body: {
          displayName: safeValue(field(form, "displayName")),
          name: safeValue(field(form, "name")),
          email: safeValue(field(form, "email")),
        },
      });
      state.viewer = data.viewer || state.viewer;
      const fileInput = qs("#settingsAvatar");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (file) {
        const upload = new FormData();
        upload.set("file", file);
        const avatar = await api("me/avatar", { method: "POST", body: upload });
        state.viewer = avatar.viewer || state.viewer;
        fileInput.value = "";
      }
      writeCache(cacheKeys.viewer, state.viewer);
      renderViewer();
      await loadSettings();
      setStatus("#settingsStatus", "Settings saved.", true);
    } catch (error) {
      setStatus("#settingsStatus", error.message || "Settings could not be saved.", false);
    }
  }


  qs("#settingsForm")?.addEventListener("submit", saveSettings);

  qs("#settingsAvatar")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#settingsAvatarPreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });


pageLoaders.settings = loadSettings;
