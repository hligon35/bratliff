const pages = [
  ['Home', 'index.html', 'home'], ['Books', 'books.html', 'books'], ['About Barbara', 'about.html', 'about'],
  ['Read It Forward', 'read-it-forward.html', 'forward'], ['Speaking & Events', 'speaking.html', 'speaking'],
  ['Book Club', 'book-club.html', 'club'], ['Awards', 'recognition.html', 'awards'], ['Media', 'media.html', 'media'], ['Contact', 'contact.html', 'contact']
];

function header() {
  const current = document.body.dataset.page;
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container nav-wrap">
    <a class="brand" href="index.html" aria-label="Jackrabbit Punkin Publishing home"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation">☰</button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">${pages.map(([label,href,key]) => `<a href="${href}"${key===current?' aria-current="page"':''}>${label}</a>`).join('')}</nav>
  </div></header>`;
}

function socialLinks() {
  return `<div class="socials" aria-label="Social media">
    <span class="social-icon is-pending" title="Instagram profile link pending"><img src="assets/IGicon.png" alt="Instagram"></span>
    <span class="social-icon is-pending" title="X profile link pending"><img src="assets/XSocialIcon.png" alt="X"></span>
    <span class="social-icon is-pending facebook" title="Facebook profile link pending"><img src="assets/facebook.png" alt="Facebook"></span>
    <span class="social-icon is-pending" title="LinkedIn profile link pending"><img src="assets/linkedIN.png" alt="LinkedIn"></span>
    <span class="social-icon is-pending youtube" title="YouTube channel link pending"><img src="assets/youtube.png" alt="YouTube"></span>
    <a class="social-icon tiktok" href="https://www.tiktok.com/@barbararatliff765" aria-label="TikTok — @barbararatliff765"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a>
  </div>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container footer-grid">
    <div><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"><span>JP</span></span><span class="brand-copy"><strong>Jackrabbit Punkin</strong><small>Publishing LLC</small></span></a><p style="margin-top:1rem;max-width:34ch">Stories That Inspire. Books That Endure.</p><a href="mailto:Publisher@JackrabbitPunkinPublishing.com">Publisher@JackrabbitPunkinPublishing.com</a>${socialLinks()}</div>
    <div><h3>Explore</h3><div class="footer-links">${pages.slice(0,9).map(([label,href])=>`<a href="${href}">${label}</a>`).join('')}</div></div>
    <div><h3>Policies</h3><div class="footer-links"><a href="policies.html#privacy">Privacy Policy</a><a href="policies.html#terms">Terms & Conditions</a><a href="policies.html#refund">Refund Policy</a><a href="policies.html#shipping">Shipping Policy</a><a href="policies.html#accessibility">Accessibility</a><a href="policies.html#copyright">Copyright</a></div></div>
  </div><div class="container footer-bottom"><span>© 2025 Jackrabbit Punkin Publishing LLC. All Rights Reserved.</span><span>Community literacy · Veteran stories · Enduring books</span></div></footer>`;
}

document.querySelector('[data-header]')?.insertAdjacentHTML('afterbegin', header());
document.querySelector('[data-footer]')?.insertAdjacentHTML('afterbegin', footer());

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
menu?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(isOpen));
  menu.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

document.querySelectorAll('form[data-demo-form]').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault();
  const message = form.querySelector('.form-message');
  if (message) message.classList.add('show');
  form.reset();
}));

const slides = [...document.querySelectorAll('.testimonial')];
let slideIndex = 0;
function showSlide(next) {
  if (!slides.length) return;
  slideIndex = (next + slides.length) % slides.length;
  slides.forEach((slide, index) => { slide.hidden = index !== slideIndex; });
}
document.querySelector('[data-prev]')?.addEventListener('click', () => showSlide(slideIndex - 1));
document.querySelector('[data-next]')?.addEventListener('click', () => showSlide(slideIndex + 1));
showSlide(0);

const counters = document.querySelectorAll('[data-count]');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (counters.length) {
  const animate = entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target; const target = Number(el.dataset.count || 0);
    if (reduced || target === 0) { el.textContent = target; return; }
    const start = performance.now();
    const tick = now => { const p = Math.min((now-start)/1000,1); el.textContent = Math.round(target*p); if (p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); observer.unobserve(el);
  });
  const observer = new IntersectionObserver(animate, {threshold:.5});
  counters.forEach(el => observer.observe(el));
}

const modal = document.querySelector('.modal');
document.querySelectorAll('[data-notify]').forEach(button => button.addEventListener('click', () => { modal?.classList.add('open'); modal?.querySelector('input')?.focus(); }));
document.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.remove('open'));
modal?.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') modal?.classList.remove('open'); });

const requestedSubject = new URLSearchParams(location.search).get('subject');
if (requestedSubject) {
  const subject = document.querySelector('select[name="subject"]');
  if (subject && [...subject.options].some(option => option.value === requestedSubject)) subject.value = requestedSubject;
}
