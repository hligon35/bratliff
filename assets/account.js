(() => {
  const root = document.querySelector("[data-account-root]");
  if (!root) return;

  function apiBase() {
    const raw = String(window.siteConfig?.publicApiUrl || "").trim();
    try { return raw ? new URL(raw, window.location.href).origin : window.location.origin; }
    catch { return window.location.origin; }
  }

  async function request(path, options = {}) {
    const response = await fetch(apiBase() + path, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "We could not complete that request.");
    return data;
  }

  let mode = new URLSearchParams(window.location.search).has("reset") ? "reset" : "login";
  let user = null;
  let turnstileScriptPromise = null;
  let accountTurnstileWidget = null;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-turnstile-api]");
      const script = existing || document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; script.dataset.turnstileApi = "true";
      script.addEventListener("load", () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Security check did not initialize.")), { once: true });
      script.addEventListener("error", () => reject(new Error("Security check could not load. Please refresh and try again.")), { once: true });
      if (!existing) document.head.appendChild(script);
    });
    return turnstileScriptPromise;
  }
  function removeAccountTurnstile() {
    if (accountTurnstileWidget !== null && window.turnstile) { try { window.turnstile.remove(accountTurnstileWidget); } catch {} }
    accountTurnstileWidget = null;
  }
  async function mountAccountTurnstile(form) {
    const host = form?.querySelector("[data-account-turnstile]");
    const key = String(window.siteConfig?.turnstileSiteKey || "").trim();
    const submit = form?.querySelector("button[type=submit]");
    if (!host || !form || host.dataset.widgetId) return;
    if (!key) { if (submit) submit.disabled = true; message("Sign-in security is not configured. Please contact support.", true); return; }
    try {
      const turnstile = await loadTurnstile();
      if (!host.isConnected || !form.isConnected) return;
      accountTurnstileWidget = turnstile.render(host, {
        sitekey: key, action: "customer_login", theme: "light",
        callback: (token) => { const input = form.querySelector("[data-turnstile-token]"); if (input) input.value = token; },
        "expired-callback": () => { const input = form.querySelector("[data-turnstile-token]"); if (input) input.value = ""; },
        "error-callback": () => { const input = form.querySelector("[data-turnstile-token]"); if (input) input.value = ""; message("Security check failed. Please try again.", true); }
      });
      host.dataset.widgetId = String(accountTurnstileWidget);
    } catch (error) {
      if (submit) submit.disabled = true;
      message(error.message || "Security check could not load. Please refresh and try again.", true);
    }
  }

  function message(text, error = false) {
    const el = root.querySelector("[data-account-form-message]");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", error);
  }

  function setMode(next) {
    mode = next;
    render();
  }

  function renderAuth() {
    removeAccountTurnstile();
    const resetToken = new URLSearchParams(window.location.search).get("reset") || "";
    const resetEmail = new URLSearchParams(window.location.search).get("email") || "";
    const forms = {
      login: "<div class=\"account-card\"><h2>Sign in</h2><form data-account-page-form data-action=\"login\"><label>Email<input type=\"email\" name=\"email\" autocomplete=\"email\" required></label><label>Password<input type=\"password\" name=\"password\" autocomplete=\"current-password\" required></label><div class=\"customer-login-turnstile\" data-account-turnstile></div><input type=\"hidden\" name=\"cf-turnstile-response\" data-turnstile-token><button class=\"button ink\" type=\"submit\">Sign in</button><p class=\"account-form-message\" data-account-form-message role=\"status\"></p></form><p class=\"account-links\"><a href=\"#\" data-account-mode=\"signup\">Create an account</a><a href=\"#\" data-account-mode=\"forgot\">Forgot password?</a></p></div>",
      signup: "<div class=\"account-card\"><h2>Create an account</h2><form data-account-page-form data-action=\"signup\"><label>Display name<input name=\"displayName\" autocomplete=\"name\" required></label><label>Email<input type=\"email\" name=\"email\" autocomplete=\"email\" required></label><label>Password<input type=\"password\" name=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label><label>Shipping address <span>(optional)</span><textarea name=\"shippingAddress\" autocomplete=\"street-address\"></textarea></label><button class=\"button ink\" type=\"submit\">Create account</button><p class=\"account-form-message\" data-account-form-message role=\"status\"></p></form><p class=\"account-links\"><a href=\"#\" data-account-mode=\"login\">Back to sign in</a></p></div>",
      forgot: "<div class=\"account-card\"><h2>Reset your password</h2><p>Enter your account email and we will send a one-time reset link.</p><form data-account-page-form data-action=\"forgot\"><label>Email<input type=\"email\" name=\"email\" autocomplete=\"email\" required></label><button class=\"button ink\" type=\"submit\">Email reset link</button><p class=\"account-form-message\" data-account-form-message role=\"status\"></p></form><p class=\"account-links\"><a href=\"#\" data-account-mode=\"login\">Back to sign in</a></p></div>",
      reset: "<div class=\"account-card\"><h2>Choose a new password</h2><form data-account-page-form data-action=\"reset\"><input type=\"hidden\" name=\"token\"><label>Email<input type=\"email\" name=\"email\" autocomplete=\"email\" required></label><label>New password<input type=\"password\" name=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label><button class=\"button ink\" type=\"submit\">Save new password</button><p class=\"account-form-message\" data-account-form-message role=\"status\"></p></form></div>",
    };
    root.innerHTML = "<div class=\"account-layout\"><div><p class=\"eyebrow\">Welcome</p><h2>Keep your JPP details together.</h2><p>Create an account to save a shipping address for future orders and review your JPP purchase history.</p></div><div>" + (forms[mode] || forms.login) + "</div></div>";
    const form = root.querySelector("[data-account-page-form]");
    if (form && mode === "reset") {
      form.elements.token.value = resetToken;
      form.elements.email.value = resetEmail;
    }
    root.querySelectorAll("[data-account-mode]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      setMode(link.dataset.accountMode || "login");
    }));
    form?.addEventListener("submit", submitAuth);
    if (form && mode === "login") mountAccountTurnstile(form);
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const action = form.dataset.action;
    const endpoint = {
      login: "/api/customer/auth/login",
      signup: "/api/customer/auth/signup",
      forgot: "/api/customer/auth/forgot-password",
      reset: "/api/customer/auth/reset-password",
    }[action];
    const submit = form.querySelector("button[type=submit]");
    const turnstileInput = form.querySelector("[data-turnstile-token]");
    if (action === "login" && !String(turnstileInput?.value || "").trim()) {
      message("Complete the security check before signing in.", true);
      return;
    }
    if (submit) submit.disabled = true;
    message("");
    try {
      const data = await request(endpoint, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      if (action === "forgot") {
        message(data.message || "Check your email for a reset link.");
        return;
      }
      user = data.user;
      window.JRPPAccount?.refresh?.();
      render();
    } catch (error) {
      message(error.message || "We could not complete that request.", true);
    } finally {
      if (action === "login" && user === null && turnstileInput && accountTurnstileWidget !== null && window.turnstile) {
        turnstileInput.value = "";
        try { window.turnstile.reset(accountTurnstileWidget); } catch {}
      }
      if (submit) submit.disabled = false;
    }
  }

  function renderProfile() {
    root.innerHTML = "<div class=\"account-layout\"><div><p class=\"eyebrow\">Your account</p><h2>Welcome back, <span data-account-name></span>.</h2><p>Your saved shipping address can be reused by the store team when fulfilling future orders. Purchases are linked to this account email.</p><button class=\"button ghost\" type=\"button\" data-account-page-logout>Sign out</button></div><div><section class=\"account-card\"><h2>Profile details</h2><form data-profile-form><div class=\"account-form-grid\"><label>Display name<input name=\"displayName\" autocomplete=\"name\" required></label><label>Email<input type=\"email\" name=\"email\" autocomplete=\"email\" required></label><label class=\"span-2\">Shipping address<textarea name=\"shippingAddress\" autocomplete=\"street-address\"></textarea></label><label>Current password<input type=\"password\" name=\"currentPassword\" autocomplete=\"current-password\"></label><label>New password<input type=\"password\" name=\"newPassword\" autocomplete=\"new-password\" minlength=\"8\"></label></div><button class=\"button ink\" type=\"submit\">Save profile</button><p class=\"account-form-message\" data-account-form-message role=\"status\"></p></form></section><section class=\"account-section\"><h2>Past purchases</h2><div class=\"purchase-list\" data-purchase-list><p>Loading your purchases…</p></div></section></div></div>";
    root.querySelector("[data-account-name]").textContent = user.displayName || "reader";
    const form = root.querySelector("[data-profile-form]");
    form.elements.displayName.value = user.displayName || "";
    form.elements.email.value = user.email || "";
    form.elements.shippingAddress.value = user.shippingAddress || "";
    form.addEventListener("submit", saveProfile);
    root.querySelector("[data-account-page-logout]").addEventListener("click", async () => {
      await request("/api/customer/auth/logout", { method: "POST", body: "{}" });
      user = null;
      window.JRPPAccount?.refresh?.();
      render();
    });
    loadPurchases();
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    message("");
    try {
      const data = await request("/api/customer/profile", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      user = data.user;
      window.JRPPAccount?.refresh?.();
      message("Your profile has been saved.");
      form.elements.currentPassword.value = "";
      form.elements.newPassword.value = "";
    } catch (error) {
      message(error.message || "We could not save your profile.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function loadPurchases() {
    const list = root.querySelector("[data-purchase-list]");
    if (!list) return;
    try {
      const data = await request("/api/customer/purchases");
      if (!data.purchases?.length) {
        list.innerHTML = "<p>No purchases are linked to this account yet.</p>";
        return;
      }
      list.innerHTML = "";
      data.purchases.forEach((purchase) => {
        const card = document.createElement("article");
        card.className = "purchase-card";
        const date = purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString() : "Date unavailable";
        const cardHeader = document.createElement("header");
        const orderLabel = document.createElement("strong");
        orderLabel.textContent = "Order " + String(purchase.orderNumber || "");
        const dateLabel = document.createElement("span");
        dateLabel.textContent = date;
        cardHeader.append(orderLabel, dateLabel);
        const summary = document.createElement("p");
        summary.textContent = "Status: " + String(purchase.paymentStatus || "Pending") + " · Total: $" + Number(purchase.total || 0).toFixed(2);
        card.append(cardHeader, summary);
        const items = document.createElement("ul");
        (purchase.items || []).forEach((item) => {
          const li = document.createElement("li");
          li.textContent = (item.title || item.sku || "Book") + " × " + item.quantity;
          items.appendChild(li);
        });
        card.appendChild(items);
        list.appendChild(card);
      });
    } catch (error) {
      list.replaceChildren();
      const errorMessage = document.createElement("p");
      errorMessage.className = "account-form-message error";
      errorMessage.textContent = error.message || "Purchases could not be loaded.";
      list.appendChild(errorMessage);
    }
  }

  async function render() {
    if (!user) {
      try {
        const data = await request("/api/customer/auth/session");
        user = data.authenticated ? data.user : null;
      } catch { user = null; }
    }
    if (user) renderProfile();
    else renderAuth();
  }

  render();
})();
