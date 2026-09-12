// Transparent reverse proxy so jrpp.alphazonelabs.com mirrors jackrabbitpunkinpublishing.com
// live, with no separate deploy or content copy to keep in sync.
const TARGET_ORIGIN = "https://jackrabbitpunkinpublishing.com";
// This preview domain always shows the full site, bypassing the temporary "coming soon" gate.
const LAUNCH_REDIRECT_RE =
  /<!-- TEMPORARY LAUNCH REDIRECT:[\s\S]*?<!-- END TEMPORARY LAUNCH REDIRECT -->\s*/;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, TARGET_ORIGIN);
    const proxyRequest = new Request(targetUrl, request);
    proxyRequest.headers.set("X-Forwarded-Host", url.hostname);
    const response = await fetch(proxyRequest);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const patched = html.replace(LAUNCH_REDIRECT_RE, "");
    return new Response(patched, response);
  },
};
