window.siteConfig = (function freeze(value) {
  Object.values(value).forEach(function (entry) {
    if (entry && typeof entry === "object") freeze(entry);
  });
  return Object.freeze(value);
})({
  "siteUrl": "https://jackrabbitpunkinpublishing.com",
  "publicApiUrl": "",
  "formEndpoint": "/api/forms/submit",
  "storeBooksEndpoint": "/api/store/books",
  "storeCheckoutEndpoint": "/api/store/checkout",
  "storeConfirmEndpoint": "/api/store/confirm-checkout",
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
    "sponsorships": {
      "pagePal": "https://square.link/u/kDcU50U8",
      "chapterChampion": "https://square.link/u/NvctrNSJ",
      "bookshelfBuilder": "https://square.link/u/MdIviBrX",
      "literacyTrailblazer": "https://square.link/u/ZPMXKAvV"
    }
  }
});
