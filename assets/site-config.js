window.siteConfig = (function freeze(value) {
  Object.values(value).forEach(function (entry) {
    if (entry && typeof entry === "object") freeze(entry);
  });
  return Object.freeze(value);
})({
  "siteUrl": "https://jackrabbitpunkinpublishing.com",
  "publicApiUrl": "https://jackrabbitpunkinpublishing.com",
  "formEndpoint": "https://jackrabbitpunkinpublishing.com/api/forms/submit",
  "storeBooksEndpoint": "https://jackrabbitpunkinpublishing.com/api/store/books",
  "storeCheckoutEndpoint": "https://jackrabbitpunkinpublishing.com/api/store/checkout",
  "loginUrl": "https://jackrabbitpunkinpublishing.com/login/",
  "adminUrl": "https://jackrabbitpunkinpublishing.com/admin/",
  "adminApiUrl": "https://jackrabbitpunkinpublishing.com/api/admin",
  "authGoogleEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/google",
  "authSessionEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/session",
  "authLogoutEndpoint": "https://jackrabbitpunkinpublishing.com/api/auth/logout",
  "googleClientId": "1046438446475-e24chmr5bnsjn0dik3t5me1i77856qlk.apps.googleusercontent.com",
  "adminEmail": "hligon@getsparqd.com",
  "squareLinks": {
    "books": {
      "battlesHardcover": "",
      "battlesPaperback": ""
    },
    "sponsorships": {
      "pagePal": "",
      "chapterChampion": "",
      "bookshelfBuilder": "",
      "literacyTrailblazer": ""
    }
  }
});
