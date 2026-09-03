const pages = [
  ["Home", "index.html", "home"],
  ["Books", "books.html", "books"],
  ["About Barbara", "about.html", "about"],
  ["Read It Forward", "read-it-forward.html", "forward"],
  ["Speaking & Events", "speaking.html", "speaking"],
  ["Book Club", "book-club.html", "club"],
  ["Awards", "recognition.html", "awards"],
  ["Media", "media.html", "media"],
  ["Contact", "contact.html", "contact"],
];

const siteConfig = window.siteConfig || {};
const formEndpoint = normalizeUrl(siteConfig.formEndpoint);
const loginUrl = normalizeUrl(siteConfig.loginUrl);
const adminUrl = normalizeUrl(siteConfig.adminUrl);
const adminApiUrl = normalizeUrl(siteConfig.adminApiUrl);
const artwork = Object.freeze({
  logo: "assets/jrppLogo.png",
  featuredBook: "assets/book1.png",
  futureBook: "assets/book2.png",
  author: "assets/barbaraRatliff.png",
});

function normalizeUrl(value) {
  return String(value || "").trim();
}

function isConfiguredUrl(value) {
  return Boolean(value) && !/your-deployment-id|example\.com/i.test(value);
}

function withAdminAction(value, action) {
  const url = normalizeUrl(value);
  if (!isConfiguredUrl(url)) return '';
  try {
    const parsed = new URL(url, window.location.href);
    parsed.searchParams.set('action', action);
    return parsed.toString();
  } catch (error) {
    const clean = url.replace(/([?&])action=[^&]*/i, '$1').replace(/[?&]$/, '');
    return clean + (clean.includes('?') ? '&' : '?') + 'action=' + encodeURIComponent(action);
  }
}

function buildAdminDashboardUrl(value) {
  const url = normalizeUrl(value);
  if (!isConfiguredUrl(url) && !url.startsWith('/') && !url.startsWith('./')) {
    return 'admin/';
  }
  if (/script\.google\.com/i.test(url)) {
    return withAdminAction(url, 'storeAdmin');
  }
  return url;
}

function buildAdminLoginUrl(value) {
  const url = normalizeUrl(value);
  if (!isConfiguredUrl(url) && !url.startsWith('/') && !url.startsWith('./')) {
    return 'login/';
  }
  return url;
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(src);
    image.onerror = () => resolve("");
    image.src = src;
  });
}

function setImageMarkup(target, className, src, alt, isDecorative) {
  if (!target || !src) return;
  target.classList.add(className);
  if (isDecorative) target.setAttribute("aria-hidden", "true");
  else target.setAttribute("aria-label", alt);
  target.innerHTML = `<img src="${src}" alt="${isDecorative ? "" : alt}">`;
}

async function wireArtwork() {
  const [logoSrc, featuredBookSrc, authorSrc] = await Promise.all([
    preloadImage(artwork.logo),
    preloadImage(artwork.featuredBook),
    preloadImage(artwork.author),
  ]);

  if (logoSrc) {
    document.querySelectorAll(".brand").forEach((brand) => {
      const copy = brand.querySelector(".brand-copy");
      if (!copy || brand.querySelector(".brand-logo")) return;
      brand.classList.add("brand-with-logo");
      const logo = document.createElement("img");
      logo.className = "brand-logo";
      logo.src = logoSrc;
      logo.alt = "Jackrabbit Punkin Publishing";
      const mark = brand.querySelector(".brand-mark");
      if (mark) mark.remove();
      brand.insertBefore(logo, copy);
    });
  }

  if (featuredBookSrc) {
    const heroCover = document.querySelector(".hero-art .cover-placeholder");
    setImageMarkup(heroCover, "has-cover", featuredBookSrc, "Battles Beyond the Waves cover", true);

    document.querySelectorAll(".book-art").forEach((card) => {
      if (card.querySelector("img")) return;
      const label = card.getAttribute("aria-label") || "Battles Beyond the Waves cover";
      setImageMarkup(card, "has-cover", featuredBookSrc, label, true);
    });
  }

  if (authorSrc) {
    document.querySelectorAll(".photo-placeholder").forEach((photo) => {
      if (photo.querySelector("img")) return;
      setImageMarkup(photo, "has-photo", authorSrc, "Barbara J. Ratliff", true);
    });
  }
}

function header() {
  const current = document.body.dataset.page;
  const cartLink = current === "books"
    ? '<button class="site-cart-button" type="button" data-store-cart-trigger aria-label="Open shopping cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2Zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2ZM7.17 14h9.96c.75 0 1.4-.41 1.74-1.03L22 7.5V6H6.21l-.94-2H2v2h2l3.6 7.59-1.35 2.45A2 2 0 0 0 6 17c0 1.1.9 2 2 2h12v-2H8.42a.25.25 0 0 1-.22-.37L9.1 15h8.07Z"></path></svg><span class="store-cart-count" data-store-cart-count>0</span></button>'
    : "";
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container nav-wrap">
    <a class="brand" href="index.html" aria-label="Jackrabbit Punkin Publishing home"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation">☰</button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">${pages.map(([label, href, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ""}>${label}</a>`).join("")}${cartLink}</nav>
  </div></header>`;
}

function socialLinks() {
  return `<div class="socials" aria-label="Social media">
    <span class="social-icon"><img src="assets/IGicon.png" alt="Instagram"></span>
    <span class="social-icon"><img src="assets/XSocialIcon.png" alt="X"></span>
    <span class="social-icon facebook"><img src="assets/facebook.png" alt="Facebook"></span>
    <span class="social-icon"><img src="assets/linkedIN.png" alt="LinkedIn"></span>
    <span class="social-icon youtube"><img src="assets/youtube.png" alt="YouTube"></span>
    <a class="social-icon tiktok" href="https://www.tiktok.com/@barbararatliff765" aria-label="TikTok — @barbararatliff765"><img src="assets/tiktok.png" alt=""></a>
  </div>`;
}

function footer() {
  const adminLinks = isConfiguredUrl(adminUrl)
    ? `<div><h3>Admin</h3><div class="footer-links"><a href="login/">Publisher Login</a></div></div>`
    : "";
  return `<footer class="site-footer"><div class="container footer-grid">
    <div><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a><p style="margin-top:1rem;max-width:34ch">Stories That Inspire. Books That Endure.</p><a href="mailto:Publisher@JackrabbitPunkinPublishing.com">Publisher@JackrabbitPunkinPublishing.com</a>${socialLinks()}</div>
    <div><h3>Explore</h3><div class="footer-links">${pages
      .slice(0, 9)
      .map(([label, href]) => `<a href="${href}">${label}</a>`)
      .join("")}</div></div>
    <div><h3>Policies</h3><div class="footer-links"><a href="policies.html#privacy">Privacy Policy</a><a href="policies.html#terms">Terms & Conditions</a><a href="policies.html#refund">Refund Policy</a><a href="policies.html#shipping">Shipping Policy</a><a href="policies.html#accessibility">Accessibility</a><a href="policies.html#copyright">Copyright</a></div></div>
    ${adminLinks}
  </div><div class="container footer-bottom"><span>© 2025 Jackrabbit Punkin Publishing LLC. All Rights Reserved.</span><span>Community literacy · Veteran stories · Enduring books</span></div></footer>`;
}

document
  .querySelector("[data-header]")
  ?.insertAdjacentHTML("afterbegin", header());
document
  .querySelector("[data-footer]")
  ?.insertAdjacentHTML("afterbegin", footer());

wireArtwork();

const menu = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
menu?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(isOpen));
  menu.setAttribute(
    "aria-label",
    isOpen ? "Close navigation" : "Open navigation",
  );
});

function setFormMessage(form, message, isError) {
  const panel = form.querySelector(".form-message");
  if (!panel) return;
  panel.textContent = message;
  panel.classList.add("show");
  panel.classList.toggle("error", Boolean(isError));
}

function clearFormMessage(form) {
  const panel = form.querySelector(".form-message");
  if (!panel) return;
  panel.classList.remove("show", "error");
}

function getNotifyTitle(button) {
  return (
    button.closest(".card")?.querySelector("h3")?.textContent?.trim() || ""
  );
}

function syncNotificationTitle(title) {
  const form = document.querySelector(
    'form[data-form-type="bookNotification"]',
  );
  const input = form?.querySelector('input[name="title"]');
  const label = document.querySelector("[data-notify-title]");
  if (input) input.value = title;
  if (label)
    label.textContent = title
      ? `You’ll receive updates for ${title}.`
      : "Join the list for new title announcements.";
}

async function submitLiveForm(form) {
  clearFormMessage(form);

  if (!isConfiguredUrl(formEndpoint)) {
    setFormMessage(
      form,
      "Form submissions are not configured yet. Add PUBLIC_API_URL to .env and rerun npm run prepare:config.",
      true,
    );
    return;
  }

  const submitButton = form.querySelector(
    'button[type="submit"], input[type="submit"]',
  );
  const originalButtonText = submitButton ? submitButton.textContent : "";
  const formData = new FormData(form);
  const payload = new URLSearchParams();

  for (const [name, value] of formData.entries()) {
    payload.set(name, String(value || "").trim());
  }

  payload.set("formType", form.dataset.formType || "contact");
  payload.set("pageUrl", window.location.href);
  payload.set("userAgent", window.navigator.userAgent);

  if (payload.get("formType") === "newsletter" && !payload.get("consent")) {
    payload.set("consent", "true");
  }

  if (payload.get("formType") === "bookNotification" && !payload.get("title")) {
    const fallbackTitle = form.dataset.bookTitle || "";
    if (fallbackTitle) payload.set("title", fallbackTitle);
  }

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload.toString(),
    };

    if (/script\.google\.com/i.test(formEndpoint)) {
      await fetch(formEndpoint, {
        ...requestInit,
        mode: "no-cors",
      });
    } else {
      const response = await fetch(formEndpoint, requestInit);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "We could not send your request just now.");
      }
    }

    setFormMessage(
      form,
      form.dataset.successMessage || "Thank you. Your request has been sent.",
    );
    form.reset();
    if (form.dataset.formType === "bookNotification") {
      syncNotificationTitle("");
      modal?.classList.remove("open");
    }
  } catch (error) {
    setFormMessage(
      form,
      "We could not send your request just now. Please try again in a moment or email us directly.",
      true,
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }
}

document.querySelectorAll("form[data-form-type]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitLiveForm(form);
  });
});

function initAdminEntryPages() {
  const loginButton = document.querySelector("[data-login-continue]");
  const loginStatus = document.querySelector("[data-login-status]");
  const dashboardUrl = buildAdminDashboardUrl(adminUrl);
  const entryUrl = buildAdminLoginUrl(loginUrl);

  if (loginButton) {
    loginButton.setAttribute('href', dashboardUrl || 'contact.html?subject=Admin%20Access');
  }
  if (loginStatus) {
    loginStatus.textContent = adminApiUrl
      ? 'Sign in with your authorized Google account to open the publisher admin system.'
      : entryUrl
        ? 'Publisher login is visible, but the live admin API is not configured yet. Finish PUBLIC_API_URL before using live tools.'
        : 'Admin access is not configured yet. Add PUBLIC_API_URL and regenerate the site config.';
  }
}

initAdminEntryPages();

const slides = [...document.querySelectorAll(".testimonial")];
let slideIndex = 0;
let slideInterval;
let slideTransitionTimer;
function showSlide(next) {
  if (!slides.length) return;
  const nextIndex = (next + slides.length) % slides.length;
  const currentSlide = slides[slideIndex];
  const nextSlide = slides[nextIndex];

  if (nextIndex === slideIndex && currentSlide.classList.contains("is-active")) {
    return;
  }

  window.clearTimeout(slideTransitionTimer);
  slides.forEach((slide) => slide.classList.remove("is-leaving"));

  currentSlide.classList.remove("is-active");
  currentSlide.classList.add("is-leaving");
  currentSlide.setAttribute("aria-hidden", "true");

  slideIndex = nextIndex;
  nextSlide.hidden = false;
  nextSlide.classList.add("is-active");
  nextSlide.setAttribute("aria-hidden", "false");

  slideTransitionTimer = window.setTimeout(() => {
    currentSlide.classList.remove("is-leaving");
  }, 650);
}
function startSlider() {
  window.clearInterval(slideInterval);
  if (slides.length > 1) {
    slideInterval = window.setInterval(() => showSlide(slideIndex + 1), 4000);
  }
}
function pauseSlider() {
  window.clearInterval(slideInterval);
}
document
  .querySelector("[data-prev]")
  ?.addEventListener("click", () => {
    showSlide(slideIndex - 1);
    startSlider();
  });
document
  .querySelector("[data-next]")
  ?.addEventListener("click", () => {
    showSlide(slideIndex + 1);
    startSlider();
  });
if (slides.length) {
  const stage = document.querySelector(".testimonial-stage");
  stage?.classList.add("is-enhanced");
  slides.forEach((slide, index) => {
    slide.hidden = false;
    slide.classList.toggle("is-active", index === 0);
    slide.setAttribute("aria-hidden", String(index !== 0));
  });
  stage?.addEventListener("mouseenter", pauseSlider);
  stage?.addEventListener("mouseleave", startSlider);
  stage?.addEventListener("focusin", pauseSlider);
  stage?.addEventListener("focusout", startSlider);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseSlider();
    else startSlider();
  });
  startSlider();
}

const counters = document.querySelectorAll("[data-count]");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (counters.length) {
  const animate = (entries) =>
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.count || 0);
      if (reduced || target === 0) {
        el.textContent = target;
        return;
      }
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 1000, 1);
        el.textContent = Math.round(target * p);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  const observer = new IntersectionObserver(animate, { threshold: 0.5 });
  counters.forEach((el) => observer.observe(el));
}

const modal = document.querySelector(".modal");
document.querySelectorAll("[data-notify]").forEach((button) =>
  button.addEventListener("click", () => {
    const title = getNotifyTitle(button);
    const form = document.querySelector(
      'form[data-form-type="bookNotification"]',
    );
    if (form) form.dataset.bookTitle = title;
    syncNotificationTitle(title);
    modal?.classList.add("open");
    modal?.querySelector('input[type="email"]')?.focus();
  }),
);
document
  .querySelector(".modal-close")
  ?.addEventListener("click", () => modal.classList.remove("open"));
modal?.addEventListener("click", (event) => {
  if (event.target === modal) modal.classList.remove("open");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") modal?.classList.remove("open");
});

const requestedSubject = new URLSearchParams(location.search).get("subject");
if (requestedSubject) {
  const subject = document.querySelector('select[name="subject"]');
  if (
    subject &&
    [...subject.options].some((option) => option.value === requestedSubject)
  )
    subject.value = requestedSubject;
}
