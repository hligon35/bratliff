(function () {
  "use strict";
  const status = document.getElementById("inviteStatus");
  const button = document.getElementById("acceptInvite");
  const login = document.getElementById("loginLink");
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || "";
  history.replaceState(null, "", location.pathname);
  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }
  if (!token) {
    button.hidden = true;
    setStatus("This invitation link is missing its token. Ask the administrator to send a new invitation.", "error");
  }
  button.addEventListener("click", async function () {
    if (!token) return;
    button.disabled = true;
    setStatus("Accepting invitation…");
    try {
      const config = window.siteConfig || {};
      const candidates = String(config.publicApiUrl || "").split(",").map(function (value) { return value.trim(); }).filter(Boolean);
      const apiRoot = candidates.find(function (value) {
        try { return new URL(value, location.href).origin === location.origin; } catch (_) { return false; }
      }) || candidates[0] || location.origin;
      const response = await fetch(apiRoot.replace(/\/$/, "") + "/api/admin/invitations/accept", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token })
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "The invitation could not be accepted.");
      setStatus("Invitation accepted for " + data.email + ". Sign in with the same Google account to open the admin workspace.", "success");
      button.hidden = true;
      login.hidden = false;
    } catch (error) {
      setStatus(error.message || "The invitation could not be accepted.", "error");
      button.disabled = false;
    }
  });
})();
