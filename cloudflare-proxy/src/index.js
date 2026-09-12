// Transparent reverse proxy so jrpp.alphazonelabs.com mirrors jackrabbitpunkinpublishing.com
// live, with no separate deploy or content copy to keep in sync.
const TARGET_ORIGIN = "https://jackrabbitpunkinpublishing.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, TARGET_ORIGIN);
    const proxyRequest = new Request(targetUrl, request);
    proxyRequest.headers.set("X-Forwarded-Host", url.hostname);
    return fetch(proxyRequest);
  },
};
