const pages = [
  ["Home", "index.html", "home"],
  ["Books", "books.html", "books"],
  ["About Us", "about.html", "about"],
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
  brandLogo: "assets/jrppLogo2.png",
  featuredBook: "assets/battles1.png",
  futureBook: "assets/book2.png",
  author: "assets/barbaraRatliff.png",
});

function ensureFavicon() {
  const head = document.head;
  if (!head) return;
  let icon = head.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    head.appendChild(icon);
  }
  icon.href = artwork.logo;
  icon.type = "image/png";
}

function normalizeUrl(value) {
  return String(value || "").trim();
}

function isConfiguredUrl(value) {
  return Boolean(value) && !/your-deployment-id|example\.com/i.test(value);
}

function getConfigValue(path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => {
      if (!value || typeof value !== "object") return "";
      return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : "";
    }, siteConfig);
}

function hydrateConfiguredLinks() {
  document.querySelectorAll("[data-config-url]").forEach((link) => {
    const configPath = String(link.dataset.configUrl || "");
    if (window.location.hostname === "jrpp.alphazonelabs.com" && /^squareLinks\./i.test(configPath)) {
      link.removeAttribute("href");
      link.hidden = true;
      return;
    }
    const value = normalizeUrl(getConfigValue(configPath));
    let url;
    try {
      url = new URL(value);
    } catch {
      link.removeAttribute("href");
      link.hidden = true;
      return;
    }
    if (!/^https?:$/.test(url.protocol)) {
      link.removeAttribute("href");
      link.hidden = true;
      return;
    }
    link.href = url.toString();
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = false;
  });
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
  const [brandLogoSrc, featuredBookSrc, authorSrc] = await Promise.all([
    preloadImage(artwork.brandLogo),
    preloadImage(artwork.featuredBook),
    preloadImage(artwork.author),
  ]);

  if (brandLogoSrc) {
    document.querySelectorAll(".brand").forEach((brand) => {
      const copy = brand.querySelector(".brand-copy");
      if (!copy || brand.querySelector(".brand-logo")) return;
      brand.classList.add("brand-with-logo");
      const logo = document.createElement("img");
      logo.className = "brand-logo";
      logo.src = brandLogoSrc;
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
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container nav-wrap">
    <a class="brand" href="index.html" aria-label="Jackrabbit Punkin Publishing home"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation">☰</button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">${pages.map(([label, href, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  </div></header>`;
}

function socialLinks() {
  return `<div class="socials" aria-label="Social media">
  <span>
    <a class="social-icon facebook"
       href="https://www.facebook.com/profile.php?id=61589931405662"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="Facebook — Jackrabbit Punkin Publishing">
      <img src="assets/facebook.png" alt="Facebook">
    </a>
  </span>

  <span>
    <a class="social-icon linkedin"
       href="https://www.linkedin.com/in/barbara-ratliff-765"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="LinkedIn — Barbara J. Ratliff">
      <img src="assets/linkedIN.png" alt="LinkedIn">
    </a>
  </span>

  <span>
    <a class="social-icon tiktok"
       href="https://www.tiktok.com/@barbararatliff765"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="TikTok — @barbararatliff765">
      <img src="assets/tiktok.png" alt="TikTok">
    </a>
  </span>
</div>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container footer-grid">
    <div><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a><p style="margin-top:1rem;max-width:34ch">Stories That Inspire. Books That Endure.</p><a href="mailto:Publisher@JackrabbitPunkinPublishing.com">Publisher@JackrabbitPunkinPublishing.com</a>${socialLinks()}</div>
    <div><h3>Explore</h3><div class="footer-links">${pages
      .slice(0, 9)
      .map(([label, href]) => `<a href="${href}">${label}</a>`)
      .join("")}</div></div>
    <div><h3>Policies</h3><div class="footer-links"><a href="policies.html#privacy">Privacy Policy</a><a href="policies.html#terms">Terms & Conditions</a><a href="policies.html#refund">Refund Policy</a><a href="policies.html#shipping">Shipping Policy</a><a href="policies.html#accessibility">Accessibility</a><a href="policies.html#copyright">Copyright</a></div></div>
  </div><div class="container footer-bottom"><span>© 2026 Jackrabbit Punkin Publishing LLC. All rights reserved.</span><span>Community literacy · Veteran stories · Enduring books</span></div></footer>`;
}

document
  .querySelector("[data-header]")
  ?.insertAdjacentHTML("afterbegin", header());
document
  .querySelector("[data-footer]")
  ?.insertAdjacentHTML("afterbegin", footer());

ensureFavicon();
wireArtwork();
hydrateConfiguredLinks();

function initPolicySections() {
  const nav = document.querySelector(".legal-nav");
  const content = document.querySelector(".legal-content");
  if (!nav || !content) return;

  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = [...content.querySelectorAll(":scope > section[id]")];
  const sectionIds = new Set(sections.map((section) => section.id));
  const firstSection = sections[0];
  if (!firstSection) return;

  sections.forEach((section) => {
    section.tabIndex = -1;
  });

  function showSection(requestedId, shouldScroll = false) {
    const activeId = sectionIds.has(requestedId) ? requestedId : firstSection.id;
    const activeSection = document.getElementById(activeId);

    sections.forEach((section) => {
      const isActive = section.id === activeId;
      section.hidden = !isActive;
      section.setAttribute("aria-hidden", String(!isActive));
    });

    links.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${activeId}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });

    if (shouldScroll && activeSection) {
      activeSection.scrollIntoView({ block: "start" });
      activeSection.focus({ preventScroll: true });
    }
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const requestedId = link.getAttribute("href").slice(1);
      if (!sectionIds.has(requestedId)) return;
      event.preventDefault();
      history.pushState(null, "", `#${requestedId}`);
      showSection(requestedId, true);
    });
  });

  window.addEventListener("hashchange", () => {
    showSection(window.location.hash.slice(1), true);
  });
  window.addEventListener("popstate", () => {
    showSection(window.location.hash.slice(1), true);
  });

  showSection(window.location.hash.slice(1));
}

initPolicySections();

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

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits ? `(${digits}` : "";
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function bindPhoneFormatting() {
  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    input.addEventListener("input", () => {
      const atEnd = input.selectionStart === input.value.length;
      input.value = formatPhoneNumber(input.value);
      if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  });
}

bindPhoneFormatting();

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
    trackEvent("form_submit", { meta: { formType: payload.get("formType") } });
    form.reset();
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
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitLiveForm(form);
  });
});

function renderTurnstileWidgets() {
  const sitekey = normalizeUrl(siteConfig.turnstileSiteKey);
  if (!sitekey || typeof window.turnstile === "undefined") return;
  document.querySelectorAll(".cf-turnstile").forEach((el) => {
    if (el.dataset.rendered) return;
    el.dataset.rendered = "true";
    window.turnstile.render(el, { sitekey, action: "turnstile-spin-v1" });
  });
}

window.onloadTurnstileCallback = renderTurnstileWidgets;
if (document.readyState !== "loading") renderTurnstileWidgets();
else document.addEventListener("DOMContentLoaded", renderTurnstileWidgets);

function initAdminEntryPages() {
  const loginStatus = document.querySelector("[data-login-status]");
  const entryUrl = buildAdminLoginUrl(loginUrl);

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
let modalTrigger = null;

function closeNotificationModal() {
  if (!modal?.classList.contains("open")) return;
  modal.classList.remove("open");
  modalTrigger?.focus();
  modalTrigger = null;
}

document.querySelectorAll("[data-notify]").forEach((button) =>
  button.addEventListener("click", () => {
    modalTrigger = button;
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
  ?.addEventListener("click", closeNotificationModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeNotificationModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNotificationModal();
  if (event.key !== "Tab" || !modal?.classList.contains("open")) return;
  const focusable = [
    ...modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
    ),
  ].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const documentViewer = document.querySelector("[data-document-viewer-modal]");
let documentViewerTrigger = null;

function closeDocumentViewer() {
  if (!documentViewer?.classList.contains("open")) return;
  documentViewer.classList.remove("open");
  documentViewer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("document-viewer-open");
  const frame = documentViewer.querySelector("[data-document-viewer-frame]");
  const image = documentViewer.querySelector("[data-document-viewer-image]");
  if (frame) {
    frame.removeAttribute("src");
    frame.hidden = false;
  }
  if (image) {
    image.removeAttribute("src");
    image.hidden = true;
  }
  documentViewerTrigger?.focus();
  documentViewerTrigger = null;
}

function openDocumentViewer(button) {
  const source = button?.dataset.documentViewer;
  if (!documentViewer || !source) return;
  documentViewerTrigger = button;
  const title = button.dataset.documentTitle || "Document viewer";
  const heading = documentViewer.querySelector("#document-viewer-title");
  const frame = documentViewer.querySelector("[data-document-viewer-frame]");
  const image = documentViewer.querySelector("[data-document-viewer-image]");
  const newTab = documentViewer.querySelector("[data-document-viewer-new-tab]");
  const viewOnly = button.hasAttribute("data-document-viewer-view-only");
  if (newTab) newTab.hidden = viewOnly;
  if (heading) heading.textContent = title;
  const isImage = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(source);
  if (frame) {
    frame.title = title + " document viewer";
    if (isImage) {
      frame.removeAttribute("src");
      frame.hidden = true;
    } else {
      frame.hidden = false;
      frame.src = source;
    }
  }
  if (image) {
    if (isImage) {
      image.src = source;
      image.alt = title;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
  }
  if (newTab) newTab.href = source;
  documentViewer.classList.add("open");
  documentViewer.setAttribute("aria-hidden", "false");
  document.body.classList.add("document-viewer-open");
  documentViewer.querySelector("[data-document-viewer-close]")?.focus();
}

document.querySelectorAll("[data-document-viewer]").forEach((button) => {
  button.addEventListener("click", () => openDocumentViewer(button));
});
documentViewer?.querySelectorAll("[data-document-viewer-close]").forEach((button) => {
  button.addEventListener("click", closeDocumentViewer);
});
documentViewer?.addEventListener("click", (event) => {
  if (event.target === documentViewer) closeDocumentViewer();
});
document.addEventListener("keydown", (event) => {
  if (!documentViewer?.classList.contains("open")) return;
  if (event.key === "Escape") {
    closeDocumentViewer();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...documentViewer.querySelectorAll(
      'button:not([disabled]), a[href], iframe',
    ),
  ].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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

if (document.body.dataset.page === "forward") {
  initSponsorProgram();
}

initFeaturedAuthor();

function initFeaturedAuthor() {
  const section = document.querySelector("[data-featured-author]");
  if (!section) return;

  const portraits = [
    { src: "assets/maleFeature.png", alt: "Featured male author" },
    { src: "assets/femaleFeature.png", alt: "Featured female author" },
  ];
  const portraitEl = section.querySelector("[data-featured-author-portrait]");
  const portraitCaptionEl = section.querySelector("[data-featured-author-portrait-caption]");
  const bookCoverEl = section.querySelector("[data-featured-author-book-cover]");
  const bookTitleEl = section.querySelector("[data-featured-author-book-title]");
  let portraitIndex = 0;

  function showPortrait() {
    if (!portraitEl) return;
    const portrait = portraits[portraitIndex];
    portraitEl.src = portrait.src;
    portraitEl.alt = portrait.alt;
    portraitEl.hidden = false;
    portraitEl.closest(".spotlight-visual")?.classList.add("has-image");
    if (portraitCaptionEl) portraitCaptionEl.hidden = true;
  }

  showPortrait();
  window.setInterval(() => {
    portraitIndex = (portraitIndex + 1) % portraits.length;
    showPortrait();
  }, 3000);

  if (bookCoverEl) {
    bookCoverEl.src = "assets/bookFeature.png";
    bookCoverEl.alt = "Featured book cover";
    bookCoverEl.hidden = false;
    bookCoverEl.closest(".spotlight-visual")?.classList.add("has-image");
  }
  if (bookTitleEl) bookTitleEl.hidden = true;
  section.hidden = false;

  const apiBase = resolvePublicApiBase();
  fetch(`${apiBase}/api/authors/featured`, { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
      if (!data || !data.ok || !data.author) return;
      renderFeaturedAuthor(section, data.author);
    })
    .catch(() => {});

  function renderFeaturedAuthor(root, author) {
    const nameEl = root.querySelector("[data-featured-author-name]");
    const titleEl = root.querySelector("[data-featured-author-title]");
    const introEl = root.querySelector("[data-featured-author-intro]");
    const bioEl = root.querySelector("[data-featured-author-bio]");
    const ctaEl = root.querySelector("[data-featured-author-cta]");
    const socialsEl = root.querySelector("[data-featured-author-socials]");

    if (nameEl) nameEl.textContent = author.name || "";
    if (titleEl) titleEl.textContent = author.title || "Featured Author";
    if (introEl) introEl.textContent = author.shortIntro || "";
    if (bioEl) bioEl.textContent = author.biography || "";
    if (socialsEl) {
      const icons = { facebook: "f", instagram: "◎", linkedin: "in", tiktok: "♪", youtube: "▶" };
      let links = author.socialLinks && typeof author.socialLinks === "object" ? author.socialLinks : {};
      if (Array.isArray(author.socialLinks)) {
        links = {};
        author.socialLinks.forEach((url) => {
          const value = String(url || "");
          const key = /instagram/i.test(value) ? "instagram" : /linkedin/i.test(value) ? "linkedin" : /tiktok/i.test(value) ? "tiktok" : /youtube/i.test(value) ? "youtube" : "facebook";
          if (!links[key]) links[key] = value;
        });
      }
      const allowed = ["facebook", "instagram", "linkedin", "tiktok", "youtube"];
      socialsEl.innerHTML = allowed.filter((key) => links[key]).map((key) =>
        `<a class="author-social-icon author-social-${key}" href="${escapeHtmlSponsor(links[key])}" target="_blank" rel="noopener" aria-label="${key}"><span aria-hidden="true">${icons[key]}</span></a>`,
      ).join("");
      socialsEl.hidden = !socialsEl.children.length;
    }
    if (ctaEl) {
      if (author.ctaLabel) ctaEl.textContent = author.ctaLabel;
      if (author.ctaUrl) ctaEl.href = author.ctaUrl;
      if (author.ctaLabel || author.ctaUrl) ctaEl.hidden = false;
    }
  }
}

function resolvePublicApiBase() {
  const raw = normalizeUrl(siteConfig.publicApiUrl);
  if (!raw) return window.location.origin;
  try {
    return new URL(raw, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function trackEvent(eventType, extra) {
  const apiBase = resolvePublicApiBase();
  if (!apiBase || document.body.dataset.page === "login") return;
  const payload = new URLSearchParams();
  payload.set("eventType", eventType);
  payload.set("pagePath", window.location.pathname);
  if (extra && extra.bookId) payload.set("bookId", extra.bookId);
  if (extra && extra.meta) payload.set("meta", JSON.stringify(extra.meta));
  const url = `${apiBase}/api/analytics/event`;
  if (navigator.sendBeacon) {
    const blob = new Blob([payload.toString()], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
    navigator.sendBeacon(url, blob);
  } else {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString(),
      keepalive: true,
    }).catch(() => {});
  }
}

trackEvent("page_view");

function escapeHtmlSponsor(value) {
  return String(value == null ? "" : value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]),
  );
}

function initSponsorProgram() {
  const apiBase = resolvePublicApiBase();
  const packageButtons = [...document.querySelectorAll("[data-sponsor-package]")];
  const recognitionMount = document.querySelector("[data-sponsor-recognition]");
  handleSponsorPaymentReturn();
  if (!packageButtons.length && !recognitionMount) return;

  const packageInfo = {
    pagePal: { label: "Page Pal", price: "$100", books: 5 },
    chapterChampion: { label: "Chapter Champion", price: "$250", books: 12 },
    bookshelfBuilder: { label: "Bookshelf Builder", price: "$500", books: 25 },
    literacyTrailblazer: { label: "Literacy Trailblazer", pricePerBook: 20, minBooks: 50 },
  };
  ensureSponsorModal();
  packageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!apiBase) {
        window.alert("Sponsorship checkout is not configured yet.");
        return;
      }
      openSponsorModal(button.dataset.sponsorPackage);
    });
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === "jrpp-sponsor-success") {
      closeSponsorModal();
      if (recognitionMount) loadSponsorRecognition();
      window.alert("Thank you! Your sponsorship payment was received.");
    }
  });

  if (recognitionMount) loadSponsorRecognition();

  // If this page was opened as the Square checkout popup and payment just completed,
  // notify the original tab and close this one instead of leaving two windows open.
  function handleSponsorPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sponsor") !== "success") return;
    const sponsorId = params.get("sponsorId") || "";
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "jrpp-sponsor-success", sponsorId }, window.location.origin);
      window.close();
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
    window.alert("Thank you! Your sponsorship payment was received.");
  }

  function ensureSponsorModal() {
    if (document.querySelector(".sponsor-modal-backdrop")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="sponsor-modal-backdrop" aria-hidden="true">
        <div class="sponsor-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-modal-title">
          <button type="button" class="sponsor-modal-close" data-sponsor-close aria-label="Close sponsorship form">&times;</button>
          <h2 id="sponsor-modal-title">Sponsor books</h2>
          <p data-sponsor-modal-summary></p>
          <form data-sponsor-form novalidate>
            <input type="hidden" name="package" data-sponsor-package-field />
            <label>Your name
              <input type="text" name="payerName" required maxlength="200" autocomplete="name" />
            </label>
            <label>Email
              <input type="email" name="payerEmail" required maxlength="320" autocomplete="email" />
            </label>
            <label>Display name (how you'd like to be recognized)
              <input type="text" name="displayName" maxlength="200" autocomplete="off" />
            </label>
            <label>Organization type
              <select name="entityType">
                <option value="individual">Individual</option>
                <option value="business">Business</option>
                <option value="organization">Organization</option>
              </select>
            </label>
            <label>Website (optional)
              <input type="url" name="websiteUrl" maxlength="1000" autocomplete="url" placeholder="https://" />
            </label>
            <label data-sponsor-books-field hidden>Number of books (50 minimum)
              <input type="number" name="books" min="50" step="1" value="50" />
            </label>
            <label data-sponsor-mailing-field hidden>Mailing address (private; required for Literacy Trailblazer certificate)
              <textarea name="mailingAddress" rows="4" maxlength="1200" autocomplete="street-address"></textarea>
              <small>This address is used privately to prepare and mail your certificate.</small>
            </label>
            <label data-sponsor-logo-field hidden>Organization logo (optional)
              <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
              <small>PNG, JPG, SVG, or WebP · 3 MB maximum</small>
            </label>
            <div class="sponsor-checkbox-group">
              <label class="sponsor-checkbox">
                <input type="checkbox" name="anonymous" /> Keep my sponsorship anonymous
              </label>
              <label class="sponsor-checkbox">
                <input type="checkbox" name="publishPermission" checked /> I give JPP permission to publicly recognize this sponsorship
              </label>
            </div>
            <div data-sponsor-error class="form-error" role="alert" hidden></div>
            <button type="submit" class="button ink" style="width:100%">Continue to payment</button>
          </form>
        </div>
      </div>`,
    );
    document.querySelector("[data-sponsor-close]").addEventListener("click", closeSponsorModal);
    document.querySelector(".sponsor-modal-backdrop").addEventListener("click", (event) => {
      if (event.target.classList.contains("sponsor-modal-backdrop")) closeSponsorModal();
    });
    document.querySelector("[data-sponsor-form]").addEventListener("submit", handleSponsorSubmit);
  }

  function openSponsorModal(packageKey) {
    const definition = packageInfo[packageKey];
    if (!definition) return;
    const backdrop = document.querySelector(".sponsor-modal-backdrop");
    const summary = document.querySelector("[data-sponsor-modal-summary]");
    const booksField = document.querySelector("[data-sponsor-books-field]");
    const logoField = document.querySelector("[data-sponsor-logo-field]");
    const mailingField = document.querySelector("[data-sponsor-mailing-field]");
    const mailingInput = document.querySelector('[data-sponsor-form] textarea[name="mailingAddress"]');
    const logoInput = document.querySelector('[data-sponsor-form] input[name="logo"]');
    const packageField = document.querySelector("[data-sponsor-package-field]");
    const errorBox = document.querySelector("[data-sponsor-error]");
    packageField.value = packageKey;
    errorBox.hidden = true;
    const isTrailblazer = packageKey === "literacyTrailblazer";
    if (isTrailblazer) {
      booksField.hidden = false;
      if (mailingField) mailingField.hidden = false;
      if (mailingInput) mailingInput.required = true;
      if (logoField) logoField.hidden = false;
      summary.textContent = `${definition.label} - ${definition.pricePerBook} per book, ${definition.minBooks}-book minimum.`;
    } else {
      booksField.hidden = true;
      if (mailingField) mailingField.hidden = true;
      if (mailingInput) {
        mailingInput.required = false;
        mailingInput.value = "";
      }
      if (logoField) logoField.hidden = true;
      if (logoInput) logoInput.value = "";
      summary.textContent = `${definition.label} - ${definition.price} sponsors ${definition.books} books.`;
    }
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    document.querySelector('[data-sponsor-form] input[name="payerName"]').focus();
  }

  function closeSponsorModal() {
    const backdrop = document.querySelector(".sponsor-modal-backdrop");
    backdrop?.classList.remove("open");
    backdrop?.setAttribute("aria-hidden", "true");
  }

  async function handleSponsorSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const errorBox = form.querySelector("[data-sponsor-error]");
    errorBox.hidden = true;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Redirecting to secure payment...";
    // Open the popup synchronously (before any await) so browsers don't block it, then
    // point it at the checkout URL once the API responds.
    const checkoutWindow = window.open("", "_blank");
    try {
      const formData = new FormData(form);
      const body = {
        package: formData.get("package"),
        payerName: formData.get("payerName"),
        payerEmail: formData.get("payerEmail"),
        displayName: formData.get("displayName"),
        entityType: formData.get("entityType"),
        websiteUrl: formData.get("websiteUrl"),
        anonymous: formData.get("anonymous") ? "true" : "false",
        publishPermission: formData.get("publishPermission") ? "true" : "false",
        books: formData.get("books") || "",
      };
      const response = await fetch(`${apiBase}/api/sponsors/checkout`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!data.ok || !data.url) throw new Error(data.error || "Sponsorship checkout could not be started.");
      trackEvent("sponsor_checkout_start", { meta: { package: body.package } });
      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.location.href = data.url;
        submitButton.disabled = false;
        submitButton.textContent = "Complete your payment in the new window";
      } else {
        window.location.href = data.url;
      }
    } catch (error) {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
      errorBox.textContent = error.message || "Something went wrong. Please try again.";
      errorBox.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = "Continue to payment";
    }
  }

  let recognitionTimer = null;
  let lowerPage = 1;
  let trailblazerPage = 1;

  async function loadSponsorRecognition() {
    try {
      const response = await fetch(
        apiBase + "/api/sponsors?lowerPage=" + lowerPage + "&lowerPageSize=50&page=" + trailblazerPage + "&pageSize=21",
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not load sponsor recognition.");
      renderSponsorRecognition(data);
      scheduleSponsorRecognition(data);
    } catch {
      recognitionMount.innerHTML = '<p class="asset-note">Sponsor recognition is temporarily unavailable.</p>';
      stopSponsorRecognitionPagination();
    }
  }

  function stopSponsorRecognitionPagination() {
    if (recognitionTimer) {
      window.clearInterval(recognitionTimer);
      recognitionTimer = null;
    }
  }

  function scheduleSponsorRecognition(data) {
    const lowerPages = Math.max(1, Math.ceil(Number(data.lowerTotal || 0) / 50));
    const trailblazerPages = Math.max(
      1,
      Math.ceil(Number(data.trailblazerTotal ?? data.total ?? 0) / 21),
    );
    if (lowerPages === 1 && trailblazerPages === 1) {
      stopSponsorRecognitionPagination();
      return;
    }
    stopSponsorRecognitionPagination();
    recognitionTimer = window.setInterval(() => {
      if (lowerPages > 1) lowerPage = lowerPage >= lowerPages ? 1 : lowerPage + 1;
      if (trailblazerPages > 1) {
        trailblazerPage = trailblazerPage >= trailblazerPages ? 1 : trailblazerPage + 1;
      }
      loadSponsorRecognition();
    }, 5000);
  }

  function packageIcon(packageKey) {
    const icons = {
      pagePal: '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true"><path d="M7 19 32 8l25 11v9H7zM10 29h44v7H10zM13 38h38v5H13zM17 47h30v5H17z" fill="currentColor"/><path d="m32 11 2.2 4.6 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7z" fill="var(--gold)"/></svg>',
      chapterChampion: '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true"><path d="M10 8h44v48H10z" fill="currentColor"/><path d="M15 14h34v7H15zm0 12h34v7H15zm0 12h34v7H15zm0 12h34v3H15z" fill="var(--gold-soft)"/><path d="M44 8v48" stroke="var(--purple)" stroke-width="2"/></svg>',
      bookshelfBuilder: '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true"><path d="M8 49 15 18l12 3-7 31zm18 3 1-38h12l-1 38zm15 0 7-34 9 2-7 34z" fill="currentColor"/><path d="m31 12 2.2 4.6 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7z" fill="var(--gold)"/></svg>',
      literacyTrailblazer: '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true"><path d="M6 24c9-10 18-10 26 0 8-10 17-10 26 0v28c-9-10-18-10-26 0C24 42 15 42 6 52z" fill="currentColor"/><path d="M32 24v28" stroke="var(--gold)" stroke-width="2"/><path d="m32 8 2.2 4.6 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7z" fill="var(--gold)"/></svg>',
    };
    return icons[packageKey] || icons.literacyTrailblazer;
  }

  function renderSponsorRecognition(data) {
    const lowerCards = (data.lowerSponsors || [])
      .map((sponsor) => {
        const packageKey = ["pagePal", "chapterChampion", "bookshelfBuilder"].includes(sponsor.package)
          ? sponsor.package
          : "pagePal";
        const name = sponsor.anonymous
          ? "Anonymous"
          : escapeHtmlSponsor(sponsor.displayName || "Sponsor");
        return "<div class=\"sponsor-name-card\" data-package=\"" + packageKey + "\">" +
          "<span class=\"sponsor-package-icon sponsor-package-icon--" + packageKey + "\" title=\"" + escapeHtmlSponsor(sponsor.packageLabel || "") + "\">" +
          packageIcon(packageKey) +
          "</span><span class=\"sponsor-name\">" + name + "</span></div>";
      })
      .join("");

    const trailblazerCards = (data.trailblazers || [])
      .map((sponsor) => {
        const name = sponsor.anonymous
          ? "Anonymous"
          : escapeHtmlSponsor(sponsor.displayName || "Sponsor");
        const logo = sponsor.logoUrl
          ? "<img src=\"" + escapeHtmlSponsor(sponsor.logoUrl) + "\" alt=\"" + escapeHtmlSponsor(sponsor.logoAlt || name) + "\" loading=\"lazy\">"
          : '<span class="sponsor-logo-placeholder" aria-hidden="true">LOGO</span>';
        return "<div class=\"sponsor-trailblazer-card\">" +
          "<div class=\"sponsor-trailblazer-logo\">" + logo + "</div>" +
          "<div class=\"sponsor-trailblazer-identity\"><span class=\"sponsor-package-icon sponsor-package-icon--literacyTrailblazer\">" +
          packageIcon("literacyTrailblazer") + "</span><span class=\"sponsor-name\">" + name + "</span></div>" +
          "<small>" + Number(sponsor.booksSponsored || 0) + " books sponsored</small></div>";
      })
      .join("");

    const lowerBlock = lowerCards
      ? '<section class="sponsor-wall-section" aria-labelledby="sponsor-wall-names-title"><h3 id="sponsor-wall-names-title">Read It Forward Sponsors</h3><div class="sponsor-lower-grid">' + lowerCards + '</div></section>'
      : "";
    const trailblazerBlock = trailblazerCards
      ? '<section class="sponsor-wall-section" aria-labelledby="trailblazer-title"><h3 id="trailblazer-title">Literacy Trailblazers</h3><div class="sponsor-trailblazer-grid">' + trailblazerCards + '</div></section>'
      : "";

    recognitionMount.innerHTML = lowerBlock + trailblazerBlock ||
      '<p class="asset-note">Sponsor recognition will appear here as sponsorships are approved.</p>';
  }
}