(function () {
  const siteConfig = window.siteConfig || {};
  const loginUrl = String(siteConfig.loginUrl || 'login/').trim();
  const adminUrl = pickUrlForCurrentOrigin(siteConfig.adminUrl, 'admin/');
  const authGoogleEndpoint = String(siteConfig.authGoogleEndpoint || '').replace(/\/$/, '');
  const authSessionEndpoint = String(siteConfig.authSessionEndpoint || '').replace(/\/$/, '');
  const googleClientId = String(siteConfig.googleClientId || '').trim();

  function normalizeUrl(value) {
    return String(value || '').trim();
  }

  // siteConfig URLs (adminUrl, publicApiUrl, etc.) may be a comma-separated list, one per served domain.
  function pickUrlForCurrentOrigin(rawValue, fallback) {
    const candidates = String(rawValue || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!candidates.length) return fallback;
    const match = candidates.find((candidate) => {
      try {
        return new URL(candidate, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    });
    return match || candidates[0];
  }

  function isConfiguredGoogleClientId(value) {
    return Boolean(value) && !/^replace-with-/i.test(value) && /\.apps\.googleusercontent\.com$/i.test(value);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function setLoginStatus(message, isError) {
    const node = qs('[data-login-status]');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#a3382a' : '';
  }

  function buildDefaultReturnTo() {
    try {
      const admin = new URL(normalizeUrl(adminUrl) || 'admin/', window.location.href);
      return admin.pathname + admin.search + admin.hash;
    } catch {
      return '/admin/';
    }
  }

  function getRequestedReturnTo() {
    const value = new URLSearchParams(window.location.search).get('returnTo') || '';
    return value || buildDefaultReturnTo();
  }

  async function fetchSession() {
    if (!authSessionEndpoint) return null;
    const response = await fetch(authSessionEndpoint, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) return null;
    return data.viewer || null;
  }

  async function exchangeCredential(credential) {
    const response = await fetch(authGoogleEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential,
        returnTo: getRequestedReturnTo()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Google sign-in could not be completed.');
    }
    return data;
  }

  function renderGoogleButton() {
    const buttonHost = qs('[data-google-login-button]');
    if (!buttonHost) return;
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      setLoginStatus('Google sign-in did not load. Refresh and try again.', true);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async function (response) {
        try {
          setLoginStatus('Signing in with Google...');
          const data = await exchangeCredential(String(response.credential || ''));
          const destination = new URL(String(data.redirectUrl || buildDefaultReturnTo()), window.location.origin);
          window.location.assign(destination.toString());
        } catch (error) {
          setLoginStatus(error.message || 'Google sign-in could not be completed.', true);
        }
      }
    });
    buttonHost.innerHTML = '';
    window.google.accounts.id.renderButton(buttonHost, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 280
    });
  }

  async function initLoginPage() {
    if (document.body?.dataset.page !== 'login') return;

    if (!authGoogleEndpoint || !authSessionEndpoint) {
      setLoginStatus('Google sign-in is not configured yet. Finish PUBLIC_API_URL and redeploy the Worker.', true);
      return;
    }

    if (!isConfiguredGoogleClientId(googleClientId)) {
      setLoginStatus('Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and redeploy.', true);
      return;
    }

    const existingSession = await fetchSession();
    if (existingSession) {
      setLoginStatus('You are already signed in. Redirecting to the admin console.');
      const destination = new URL(getRequestedReturnTo(), window.location.origin);
      window.location.replace(destination.toString());
      return;
    }

    const message = new URLSearchParams(window.location.search).get('message');
    setLoginStatus(message || 'Choose your authorized Google account to continue.');
    renderGoogleButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginPage);
  } else {
    initLoginPage();
  }
})();