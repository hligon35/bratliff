window.siteConfig = Object.freeze({
  "siteUrl": "https://alphazonelabs.com/jackrabbit",
  "formEndpoint": "https://script.google.com/macros/s/AKfycby6bzOdebhTco70LXlvf3TAy7ulu-KYT5vFXmFh5jwjyXdx66KrUaGkU3i7blgpi7oR/exec",
  "adminUrl": "https://script.google.com/macros/s/AKfycby6bzOdebhTco70LXlvf3TAy7ulu-KYT5vFXmFh5jwjyXdx66KrUaGkU3i7blgpi7oR/exec",
  "adminEmail": "hligon@getsparqd.com"
});

/* Artwork wiring and global navigation presentation. Existing placeholders remain visible if an image file has not been added yet. */
(function () {
  const artwork = {
    logo: 'assets/jrppLogo.png',
    battles: 'assets/book1.jpg',
    ddReuel: 'assets/book2.jpg',
    barbara: 'assets/barbaraRatliff.png'
  };

  function preload(src) {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(src);
      image.onerror = () => resolve('');
      image.src = src;
    });
  }

  function addArtworkStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Header navigation only */
      .site-header {
        background: var(--gold);
        color: var(--navy);
        border-bottom-color: rgba(84, 36, 118, .35);
      }
      .site-header .site-nav a {
        color: var(--navy);
      }
      .site-header .site-nav a:hover,
      .site-header .site-nav a[aria-current='page'] {
        color: var(--white);
        background: var(--purple);
      }
      .site-header .menu-toggle {
        color: var(--white);
        background: var(--purple);
        border-color: var(--purple);
      }

      .brand.brand-with-logo { min-width: 0; }
      .brand-logo {
        display: block;
        width: clamp(150px, 17vw, 205px);
        height: 58px;
        object-fit: contain;
        object-position: left center;
      }
      .site-footer .brand-logo { width: 220px; height: 72px; }

      .cover-placeholder.has-cover,
      .book-art.has-cover {
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .cover-placeholder.has-cover::before,
      .book-art.has-cover::before { display: none; }
      .cover-placeholder.has-cover img,
      .book-art.has-cover img { width: 100%; height: 100%; object-fit: cover; }
      .cover-placeholder.has-cover { aspect-ratio: 554 / 791; }
      .book-art.has-cover { min-height: 0; aspect-ratio: 554 / 791; }

      .photo-placeholder.has-photo {
        background: transparent;
        border: 0;
        overflow: hidden;
      }
      .photo-placeholder.has-photo::before { display: none; }
      .photo-placeholder.has-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 22%; }
      .hero-art .photo-placeholder.has-photo img { object-position: center 20%; }

      .future-title-cover {
        display: block;
        width: calc(100% + 3.2rem);
        max-width: none;
        aspect-ratio: 521 / 734;
        object-fit: cover;
        margin: -1.6rem -1.6rem 1.35rem;
        border-bottom: 1px solid var(--line);
      }

      @media (max-width: 860px) {
        .brand-logo { width: 155px; height: 52px; }
        .site-footer .brand-logo { width: 190px; height: 64px; }
        .site-header .site-nav { background: var(--gold); }
        .site-header .site-nav a { color: var(--navy); }
        .site-header .site-nav a:hover,
        .site-header .site-nav a[aria-current='page'] {
          color: var(--white);
          background: var(--purple);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function reorderPrimaryNav() {
    const nav = document.querySelector('.site-header .site-nav');
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll('a'));
    const aboutLink = links.find(link => /about\.html(?:$|\?)/i.test(link.getAttribute('href') || ''));
    const booksLink = links.find(link => /books\.html(?:$|\?)/i.test(link.getAttribute('href') || ''));

    if (aboutLink && booksLink && booksLink.previousElementSibling !== aboutLink) {
      nav.insertBefore(aboutLink, booksLink);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    addArtworkStyles();
    reorderPrimaryNav();

    const [logoSrc, battlesSrc, ddReuelSrc, barbaraSrc] = await Promise.all([
      preload(artwork.logo), preload(artwork.battles), preload(artwork.ddReuel), preload(artwork.barbara)
    ]);

    if (logoSrc) {
      document.querySelectorAll('.brand').forEach(brand => {
        brand.classList.add('brand-with-logo');
        brand.innerHTML = `<img class="brand-logo" src="${logoSrc}" alt="Jackrabbit Punkin Publishing LLC">`;
      });
    }

    if (battlesSrc) {
      const heroCover = document.querySelector('.hero .cover-placeholder');
      if (heroCover) {
        heroCover.classList.add('has-cover');
        heroCover.innerHTML = `<img src="${battlesSrc}" alt="Battles Beyond the Waves by Barbara J. Ratliff">`;
      }

      document.querySelectorAll('.book-art').forEach(bookArt => {
        bookArt.classList.add('has-cover');
        bookArt.innerHTML = `<img src="${battlesSrc}" alt="Battles Beyond the Waves by Barbara J. Ratliff">`;
      });
    }

    if (barbaraSrc) {
      document.querySelectorAll('.photo-placeholder').forEach(photo => {
        photo.classList.add('has-photo');
        photo.removeAttribute('aria-hidden');
        photo.innerHTML = `<img src="${barbaraSrc}" alt="Barbara J. Ratliff">`;
      });
    }

    if (ddReuelSrc && document.body.dataset.page === 'books') {
      const ddReuelCard = Array.from(document.querySelectorAll('.future-title-grid .card')).find(card => {
        const title = card.querySelector('h3');
        return title && /D\.D\.\s*&\s*Reuel/i.test(title.textContent || '');
      });
      if (ddReuelCard && !ddReuelCard.querySelector('.future-title-cover')) {
        const cover = document.createElement('img');
        cover.className = 'future-title-cover';
        cover.src = ddReuelSrc;
        cover.alt = 'The Adventures of D.D. & Reuel: The Great Pie Mystery book cover';
        ddReuelCard.insertBefore(cover, ddReuelCard.firstChild);
      }
    }
  });
})();
