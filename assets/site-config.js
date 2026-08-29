window.siteConfig = Object.freeze({
  "siteUrl": "https://alphazonelabs.com/jackrabbit",
  "formEndpoint": "https://script.google.com/macros/s/AKfycbzgMj0S_5J0qN5JXDq3EvWWjexOC4ZK6Z6pwo8WjrdilyRhK7EO-fmnOsejrNtGZ8Jr/exec",
  "adminUrl": "https://script.google.com/macros/s/AKfycbzgMj0S_5J0qN5JXDq3EvWWjexOC4ZK6Z6pwo8WjrdilyRhK7EO-fmnOsejrNtGZ8Jr/exec",
  "adminEmail": "hligon@getsparqd.com"
});

/*
 * Site artwork integration.
 * Expected image files in /assets:
 *   jrppLogo.png  - Jackrabbit Punkin Publishing company logo
 *   book1.jpg      - Battles Beyond the Waves cover
 *   book2.jpg      - The Adventures of D.D. & Reuel cover
 */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .brand-logo {
      display: block;
      width: clamp(150px, 17vw, 205px);
      height: 58px;
      background: url('jrppLogo.png') center 39% / 168% auto no-repeat;
    }

    .site-footer .brand-logo {
      width: 220px;
      height: 72px;
    }

    .cover-placeholder.has-cover,
    .book-art.has-cover {
      padding: 0;
      border: 0;
      background-color: transparent;
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      box-shadow: var(--shadow);
    }

    .cover-placeholder.has-cover::before,
    .book-art.has-cover::before {
      display: none;
    }

    .cover-placeholder.has-cover {
      background-image: url('book1.jpg');
      aspect-ratio: 554 / 791;
    }

    .book-art.has-cover {
      min-height: 0;
      aspect-ratio: 554 / 791;
      background-image: url('book1.jpg');
    }

    .future-title-cover {
      width: 100%;
      aspect-ratio: 521 / 734;
      object-fit: cover;
      margin: -1.6rem -1.6rem 1.35rem;
      width: calc(100% + 3.2rem);
      max-width: none;
      border-bottom: 1px solid var(--line);
    }

    @media (max-width: 860px) {
      .brand-logo { width: 155px; height: 52px; }
      .site-footer .brand-logo { width: 190px; height: 64px; }
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.brand').forEach(function (brand) {
      brand.innerHTML = '<span class="brand-logo" aria-hidden="true"></span>';
    });

    if (document.body.dataset.page === 'home') {
      const heroCover = document.querySelector('.cover-placeholder');
      if (heroCover) {
        heroCover.classList.add('has-cover');
        heroCover.innerHTML = '';
      }
    }

    document.querySelectorAll('.book-art').forEach(function (bookArt) {
      bookArt.classList.add('has-cover');
      bookArt.innerHTML = '';
      bookArt.setAttribute('role', 'img');
      bookArt.setAttribute('aria-label', 'Battles Beyond the Waves by Barbara J. Ratliff');
    });

    if (document.body.dataset.page === 'books') {
      const ddReuelCard = Array.from(document.querySelectorAll('.future-title-grid .card')).find(function (card) {
        const title = card.querySelector('h3');
        return title && /D\.D\.\s*&\s*Reuel/i.test(title.textContent || '');
      });

      if (ddReuelCard && !ddReuelCard.querySelector('.future-title-cover')) {
        const cover = document.createElement('img');
        cover.className = 'future-title-cover';
        cover.src = 'assets/book2.jpg';
        cover.alt = 'The Adventures of D.D. & Reuel: The Great Pie Mystery book cover';
        ddReuelCard.insertBefore(cover, ddReuelCard.firstChild);
      }
    }
  });
})();
