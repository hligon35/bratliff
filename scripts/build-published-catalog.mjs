import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const books = JSON.parse(readFileSync(root + 'assets/published-books.json', 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date = value => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' });
// Present the original cover without its transparent margins. All releases use
// the same display slot; the raster assets remain unchanged.
function cover(book, featured = false) {
  const c = book.cover;
  const percent = (value, total) => (value / total * 100).toFixed(5) + '%';
  const style = `--cover-ratio:${c.width} / ${c.height};--cover-image-width:${percent(c.canvasWidth,c.width)};--cover-image-height:${percent(c.canvasHeight,c.height)};--cover-image-left:${percent(-c.x,c.width)};--cover-image-top:${percent(-c.y,c.height)}`;
  return `<span class="book-cover-frame" style="${style}"><img${featured ? ' class="featured-book-cover"' : ''} src="${book.image}" alt="${escape(book.title)} book cover" width="${c.canvasWidth}" height="${c.canvasHeight}" ${featured ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} /></span>`;
}
function formatOptions(format) {
  return `<div class="published-format">
    <h4>${format.format}</h4>
    <p>JPP direct: <strong>$${format.directPrice.toFixed(2)}</strong> <span class="asset-note">· Standard online retail: $${format.retailPrice.toFixed(2)}</span></p>
    <div class="purchase-actions">
      <button class="purchase-button direct" type="button" data-direct-isbn="${format.isbn}" data-direct-label="Buy Direct from JPP — ${format.format}" aria-describedby="direct-purchase-benefits" disabled>Buy Direct from JPP — ${format.format}</button>
      ${format.retailers.map(retailer => `<a class="purchase-button" href="${escape(retailer.url)}" target="_blank" rel="noopener noreferrer">Buy ${retailer.name === 'Amazon' ? 'on Amazon' : 'through IngramSpark'} — ${format.format}</a>`).join('\n')}
    </div><p class="asset-note" data-direct-status="${format.isbn}" role="status">Checking direct-purchase availability…</p>
  </div>`;
}
function otherOptions(book) {
  return (book.otherRetailers || []).map(retailer => `<a class="purchase-button" href="${escape(retailer.url)}" target="_blank" rel="noopener noreferrer">${escape(retailer.label)}</a>`).join('');
}
function options(book) {
  return book.formats.map(formatOptions).join('\n') + otherOptions(book);
}
const featured = books[0];
const feature = `<section class="section"><div class="container featured-book" id="featured-release">
  <div class="book-art has-cover">${cover(featured, true)}</div>
  <div><span class="tag">Featured release</span><h2 class="featured-book-title">${escape(featured.title)}</h2>
  <div class="meta-row"><span>Barbara J. Ratliff</span><span>${escape(featured.category)}</span></div>
  <p><strong>Official release date:</strong> <time datetime="${featured.releaseDate}">${date(featured.releaseDate)}</time></p>
  ${featured.description.map((p, i) => `<p${i ? '' : ' class="lede"'}>${escape(p)}</p>`).join('\n')}
  ${options(featured)}<p class="asset-note"><a href="#direct-purchase-benefits">Autographed, embossed, with a keepsake bookmark.</a> JPP shipping is $5.00 per book, calculated at checkout.</p></div>
</div></section>`;
// Nine shared rows align covers, title copy and each format across a catalog
// row. Expanded descriptions participate in the same rows without clipping text.
const catalog = `<div class="store-grid" data-store-grid data-published-catalog>${books.map(book => `<article class="store-card" id="${book.id}">
  <div class="store-book-image">${cover(book)}</div>
  <div class="store-book-meta">${escape(book.category)}</div>
  <h3 class="published-book-title">${escape(book.title)}</h3>
  <p class="asset-note published-release">Release date: <time datetime="${book.releaseDate}">${date(book.releaseDate)}</time></p>
  <p class="published-description">${escape(book.description[0])}</p>
  <details class="published-details"><summary>Read the full description</summary>${book.description.slice(1).map(p => `<p>${escape(p)}</p>`).join('')}</details>
  ${book.formats.map(formatOptions).join('\n')}
  <div class="published-other-retailers">${otherOptions(book)}</div></article>`).join('\n')}</div>`;
const schema = `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':books.map(book => ({'@type':'Book',name:book.title,author:{'@type':'Person',name:'Barbara J. Ratliff'},publisher:{'@id':'https://jackrabbitpunkinpublishing.com/#organization'},datePublished:book.releaseDate,image:'https://jackrabbitpunkinpublishing.com/'+book.image,url:'https://jackrabbitpunkinpublishing.com/books#'+book.id,description:book.description.join('\n\n'),workExample:book.formats.map(format => ({'@type':'Book',isbn:format.isbn,bookFormat:'https://schema.org/'+format.format,offers:{'@type':'Offer',price:format.directPrice.toFixed(2),priceCurrency:'USD',url:'https://jackrabbitpunkinpublishing.com/books#'+book.id,seller:{'@id':'https://jackrabbitpunkinpublishing.com/#organization'}}}))}))}, null, 2)}</script>`;
const original = readFileSync(root + 'books.html', 'utf8');
let html = original;
for (const [key, value] of [['feature',feature],['catalog',catalog],['schema',schema]]) {
  html = html.replace(new RegExp(`<!-- published-${key}:start -->[\\s\\S]*?<!-- published-${key}:end -->`), `<!-- published-${key}:start -->\n${value}\n<!-- published-${key}:end -->`);
}
if (process.argv.includes('--check')) {
  if (html !== original) throw new Error('Books page is out of sync. Run npm run catalog:build.');
  console.log('Published catalog markup is current.');
} else {
  writeFileSync(root + 'books.html', html);
  console.log('Updated Books page from the published catalog.');
}
