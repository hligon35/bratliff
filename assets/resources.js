(() => {
  const page = document.querySelector("[data-resources-page]");
  if (!page) return;
  const publicView = page.querySelector("[data-resource-public]");
  const library = page.querySelector("[data-resource-library]");
  const grid = document.querySelector("[data-resource-grid]");
  const filters = page.querySelector("[data-resource-filters]");
  const featured = page.querySelector("[data-resource-featured]");
  const libraryGrid = page.querySelector("[data-library-grid]");
  const feedback = page.querySelector("[data-resource-feedback]");
  const auth = document.querySelector("[data-resource-auth]");
  const details = document.querySelector("[data-resource-details]");
  const registerForm = auth.querySelector("[data-resource-register]");
  const signInForm = auth.querySelector("[data-resource-signin]");
  const invite = auth.querySelector("[data-resource-invite]");
  let catalog = [];
  let selected = null;
  let signedIn = false;
  let availability = {};

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "Please try again.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function card(resource, registered = false, isFeatured = false) {
    const article = element("article", "resource-card" + (isFeatured ? " resource-card-featured" : ""));
    const cover = element("div", "resource-cover");
    if (resource.cover) {
      const image = element("img");
      image.src = resource.cover;
      image.alt = resource.coverAlt;
      image.loading = "lazy"; image.decoding = "async";
      image.width = resource.coverWidth; image.height = resource.coverHeight;
      cover.appendChild(image);
    } else {
      cover.appendChild(element("span", "resource-cover-pending", "Cover pending"));
    }
    const body = element("div", "resource-card-body");
    body.append(element("p", "resource-audience", resource.audience), element("h3", "", resource.title), element("p", "resource-description", resource.description));
    if (resource.youngReaders) body.appendChild(element("p", "resource-young-readers", "Parents, guardians, and educators: please register on behalf of young readers."));
    const actions = element("div", "resource-actions");
    if (registered) {
      const detail = element("button", "button ghost", "VIEW DETAILS");
      detail.type = "button";
      detail.addEventListener("click", () => showDetails(resource));
      const download = element("a", "button ink", "DOWNLOAD PDF");
      if (availability[resource.slug]?.available) {
        download.href = availability[resource.slug].downloadUrl;
      } else {
        download.setAttribute("aria-disabled", "true");
        download.title = "PDF pending approval";
        body.appendChild(element("p", "resource-status", "PDF pending approval"));
      }
      actions.append(detail, download);
    } else {
      const button = element("button", "button ink", "GET FREE RESOURCE");
      button.type = "button";
      button.addEventListener("click", () => { selected = resource; showAuth("invite"); });
      actions.appendChild(button);
    }
    body.appendChild(actions);
    article.append(cover, body);
    return article;
  }

  function showDetails(resource) {
    details.querySelector("[data-resource-details-audience]").textContent = resource.audience;
    details.querySelector("[data-resource-details-title]").textContent = resource.title;
    details.querySelector("[data-resource-details-list]").replaceChildren(...resource.inside.map((item) => element("li", "", item)));
    const link = details.querySelector("[data-resource-details-link]");
    link.href = resource.relatedHref;
    const arrow = element("span", "material-icons-round", "arrow_forward");
    arrow.setAttribute("aria-hidden", "true");
    link.replaceChildren(document.createTextNode(resource.relatedLabel + " " + resource.relatedText + " "), arrow);
    details.showModal();
  }

  function showAuth(mode) {
    invite.hidden = mode !== "invite";
    registerForm.hidden = mode !== "register";
    signInForm.hidden = mode !== "signin";
    if (mode === "signin") {
      window.JPPTurnstile.render(signInForm.querySelector("[data-resource-turnstile]"), { action: "customer_login", theme: "light" })
        .catch(error => { auth.querySelector("[data-resource-auth-error]").textContent = error.message; });
    }
    const password = registerForm.querySelector("[name=password]");
    password.closest("label").hidden = signedIn;
    password.disabled = signedIn;
    auth.querySelector("[data-resource-auth-error]").textContent = "";
    if (!auth.open) auth.showModal();
  }

  function showLibrary(data) {
    signedIn = true;
    auth.close();
    publicView.hidden = true;
    library.hidden = false;
    availability = Object.fromEntries((data.resources || []).map((resource) => [resource.slug, resource]));
    const first = selected || catalog.find((resource) => resource.slug === data.selectedResource) || catalog[0];
    featured.replaceChildren(card(first, true, true));
    libraryGrid.replaceChildren(...catalog.filter((resource) => resource.slug !== first.slug).map((resource) => card(resource, true)));
  }

  auth.querySelectorAll("[data-resource-mode]").forEach((button) => button.addEventListener("click", () => showAuth(button.dataset.resourceMode)));
  auth.querySelector("[data-resource-close]").addEventListener("click", () => auth.close());
  details.querySelector("[data-resource-details-close]").addEventListener("click", () => details.close());

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector("button[type=submit]");
    const form = Object.fromEntries(new FormData(registerForm));
    button.disabled = true;
    try {
      if (!signedIn) {
        await api("/api/customer/auth/signup", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password, displayName: form.firstName + " " + form.lastName }) });
        signedIn = true;
        window.JRPPAccount?.refresh?.();
      }
      await api("/api/customer/resources/register", { method: "POST", body: JSON.stringify({ ...form, selectedResource: selected.slug, marketingOptIn: Boolean(form.marketingOptIn) }) });
      showLibrary(await api("/api/customer/resources"));
      history.replaceState(null, "", "/resources?library=1");
    } catch (error) {
      auth.querySelector("[data-resource-auth-error]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = signInForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (!new FormData(signInForm).get("cf-turnstile-response")) throw new Error("Complete the security check before signing in.");
      await api("/api/customer/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(signInForm))) });
      signedIn = true;
      window.JRPPAccount?.refresh?.();
      try {
        showLibrary(await api("/api/customer/resources"));
        history.replaceState(null, "", "/resources?library=1");
      } catch (error) {
        if (error.status === 403) showAuth("register");
        else throw error;
      }
    } catch (error) {
      auth.querySelector("[data-resource-auth-error]").textContent = error.message;
    } finally {
      window.JPPTurnstile.reset(signInForm);
      button.disabled = false;
    }
  });

  Promise.all([
    fetch("assets/resource-catalog.json").then((response) => { if (!response.ok) throw new Error("The resource catalog is unavailable."); return response.json(); }),
    api("/api/customer/resources").catch(() => null)
  ]).then(([resources, session]) => {
    catalog = resources;
    const slug = new URLSearchParams(location.search).get("resource");
    selected = catalog.find((resource) => resource.slug === slug) || null;
    const labels = ["All resources", "Readers & Book Clubs", "Educators & Families", "Literacy & Community Partners", "Veterans & Military Families", "Authors & Aspiring Publishers"];
    labels.forEach((label) => {
      const button = element("button", "resource-filter", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(label === "All resources"));
      button.addEventListener("click", () => {
        grid.replaceChildren(...catalog.filter((resource) => label === "All resources" || resource.filters.includes(label)).map((resource) => card(resource)));
        filters.querySelectorAll("button").forEach((filter) => filter.setAttribute("aria-pressed", String(filter === button)));
      });
      filters.appendChild(button);
    });
    grid.replaceChildren(...catalog.map((resource) => card(resource)));
    if (session) showLibrary(session);
    else api("/api/customer/auth/session").then((data) => {
      signedIn = data.authenticated;
      if (new URLSearchParams(location.search).has("library")) showAuth(data.authenticated ? "register" : "signin");
    }).catch(() => {
      if (new URLSearchParams(location.search).has("library")) showAuth("signin");
    });
  }).catch((error) => { feedback.textContent = error.message; });
})();
