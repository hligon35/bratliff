(() => {
  const grid = document.querySelector("[data-resource-grid]");
  const note = document.querySelector("[data-resource-note]");
  if (!grid) return;
  const base = (() => {
    const raw = String(window.siteConfig?.publicApiUrl || "").trim();
    try { return raw ? new URL(raw, window.location.href).origin : window.location.origin; }
    catch { return window.location.origin; }
  })();

  document.querySelectorAll("[data-account-open]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (window.JRPPAccount?.openLoginOverlay) {
        event.preventDefault();
        window.JRPPAccount.openLoginOverlay();
      }
    });
  });

  fetch(base + "/api/customer/resources", { credentials: "include", cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Please sign in to download resources.");
      return data;
    })
    .then((data) => {
      if (note) note.textContent = data.access === "admin" ? "Administrator access is active. Live resources can be downloaded below." : "Your reader account is active. Live resources can be downloaded below.";
      (data.resources || []).forEach((resource) => {
        const card = grid.querySelector("[data-resource-card=\"" + resource.slug + "\"]");
        if (!card) return;
        const status = card.querySelector("[data-resource-status]") || card.querySelector(".resource-status");
        const link = card.querySelector("[data-download-link]");
        if (resource.available && link) {
          link.href = resource.downloadUrl;
          link.textContent = "Download resource";
          link.removeAttribute("aria-disabled");
          if (status) status.textContent = "Ready for download";
        }
      });
    })
    .catch(() => {
      if (note) note.innerHTML = "Sign in to check whether a resource is ready for download. <a href=\"account.html\" data-account-open>Open reader sign in</a>";
      note?.querySelector("[data-account-open]")?.addEventListener("click", (event) => {
        if (window.JRPPAccount?.openLoginOverlay) { event.preventDefault(); window.JRPPAccount.openLoginOverlay(); }
      });
    });
})();
