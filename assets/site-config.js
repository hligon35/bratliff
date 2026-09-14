window.siteConfig = (function freeze(value) {
  Object.values(value).forEach(function (entry) {
    if (entry && typeof entry === "object") freeze(entry);
  });
  return Object.freeze(value);
})({
  "siteUrl": "https://jackrabbitpunkinpublishing.com",
  "publicApiUrl": "https://jackrabbitpunkinpublishing.com, https://jrpp.alphazonelabs.com",
  "formEndpoint": "https://jackrabbitpunkinpublishing.com/api/forms/submit",
  "storeBooksEndpoint": "https://jackrabbitpunkinpublishing.com/api/store/books",
  "storeCheckoutEndpoint": "https://jackrabbitpunkinpublishing.com/api/store/checkout",
  "loginUrl": "https://jackrabbitpunkinpublishing.com/login/",
  "adminUrl": "https://jackrabbitpunkinpublishing.com/admin/, https://jrpp.alphazonelabs.com/admin/",
  "adminApiUrl": "https://jackrabbitpunkinpublishing.com/api/admin",
  "authGoogleEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/google",
  "authSessionEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/session",
  "authLogoutEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/logout",
  "googleClientId": "269647684139-vlj1v2rvvp092qv08s40h7h1rej9gen4.apps.googleusercontent.com",
  "adminEmail": "hligon@getsparqd.com",
  "turnstileSiteKey": "0x4AAAAAAExBb3u_5n7T_HN9",
  "squareLinks": {
    "books": {
      "battlesHardcover": "",
      "battlesPaperback": "https://square.link/u/Ab8NdSfX"
    },
    "sponsorships": {
      "pagePal": "https://square.link/u/kDcU50U8",
      "chapterChampion": "https://square.link/u/NvctrNSJ",
      "bookshelfBuilder": "https://square.link/u/MdIviBrX",
      "literacyTrailblazer": "https://square.link/u/ZPMXKAvV"
    }
  }
});
