(() => {
  const gate = document.querySelector("[data-resource-gate]");
  const content = document.querySelector("[data-resource-content]");
  const grid = document.querySelector("[data-resource-grid]");
  const note = document.querySelector("[data-resource-note]");
  if (!gate || !content || !grid) return;

  const base = (() => {
    const raw = String(window.siteConfig?.publicApiUrl || "").trim();
    try { return raw ? new URL(raw, window.location.href).origin : window.location.origin; }
    catch { return window.location.origin; }
  })();

  function openLogin(event) {
    if (!window.JRPPAccount?.openLoginOverlay) return;
    event.preventDefault();
    window.JRPPAccount.openLoginOverlay();
  }

  function bindLoginLinks() {
    gate.querySelectorAll("[data-account-open]").forEach((link) => {
      link.addEventListener("click", openLogin);
    });
  }

  function showBlocked() {
    content.hidden = true;
    gate.hidden = false;
    gate.innerHTML = "<div class=\"resource-gate-card\"><p class=\"eyebrow\">Reader resources</p><h1>Sign in to access JPP resources.</h1><p class=\"lede\">Discussion guides and publishing references are reserved for signed-in readers and authorized administrators.</p><p>Reader accounts are free. Sign in to continue, or create an account to access resources as they are published.</p><div class=\"button-row\"><a class=\"button ink\" href=\"account.html\" data-account-open>Sign in to continue</a></div></div>";
    bindLoginLinks();
  }

  function showAuthorized(data) {
    gate.hidden = true;
    content.hidden = false;
    if (note) {
      note.textContent = data.access === "admin"
        ? "Administrator access is active. Live resources can be downloaded below."
        : "Your reader account is active. Live resources can be downloaded below.";
    }
    (data.resources || []).forEach((resource) => {
      const card = grid.querySelector("[data-resource-card=\"" + resource.slug + "\"]");
      if (!card) return;
      const status = card.querySelector(".resource-status");
      const link = card.querySelector("[data-download-link]");
      if (resource.available && link) {
        link.href = resource.downloadUrl;
        link.textContent = "Download resource";
        link.removeAttribute("aria-disabled");
        if (status) status.textContent = "Ready for download";
      }
    });
  }

  fetch(base + "/api/customer/resources", { credentials: "include", cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Please sign in to access resources.");
      return data;
    })
    .then(showAuthorized)
    .catch(showBlocked);
})();
