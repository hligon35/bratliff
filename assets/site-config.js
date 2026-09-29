<<<<<<< Updated upstream
window.siteConfig = (function freeze(value) {
  Object.values(value).forEach(function (entry) {
    if (entry && typeof entry === "object") freeze(entry);
  });
  return Object.freeze(value);
})({
  "siteUrl": "https://jrpp.alphazonelabs.com",
  "publicApiUrl": "",
  "formEndpoint": "/api/forms/submit",
  "storeBooksEndpoint": "/api/store/books",
  "storeCheckoutEndpoint": "/api/store/checkout",
  "loginUrl": "/login/",
  "adminUrl": "/admin/",
  "adminApiUrl": "/api/admin",
  "authGoogleEndpoint": "/api/auth/google",
  "authSessionEndpoint": "/api/auth/session",
  "authLogoutEndpoint": "/api/auth/logout",
  "googleClientId": "269647684139-vlj1v2rvvp092qv08s40h7h1rej9gen4.apps.googleusercontent.com",
  "adminEmail": "hligon@getsparqd.com",
  "turnstileSiteKey": "0x4AAAAAAExBb3u_5n7T_HN9",
  "squareLinks": {
    "books": {
      "battlesHardcover": "",
      "battlesPaperback": "https://square.link/u/llSOK4s4"
    },
    "sponsorships": {
      "pagePal": "https://square.link/u/kDcU50U8",
      "chapterChampion": "https://square.link/u/NvctrNSJ",
      "bookshelfBuilder": "https://square.link/u/MdIviBrX",
      "literacyTrailblazer": "https://square.link/u/ZPMXKAvV"
    }
  }
=======
window.siteConfig = Object.freeze({
  siteUrl: "https://alphazonelabs.com/jackrabbit",
  formEndpoint:
    "https://script.google.com/macros/s/AKfycby6bzOdebhTco70LXlvf3TAy7ulu-KYT5vFXmFh5jwjyXdx66KrUaGkU3i7blgpi7oR/exec",
  adminUrl:
    "https://script.google.com/macros/s/AKfycby6bzOdebhTco70LXlvf3TAy7ulu-KYT5vFXmFh5jwjyXdx66KrUaGkU3i7blgpi7oR/exec",
  adminEmail: "hligon@getsparqd.com",
>>>>>>> Stashed changes
});
