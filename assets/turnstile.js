/* One explicit Turnstile loader for public forms and reader sign-in. */
(() => {
  let loading;
  const widgets = new WeakMap();
  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.turnstileApi = 'true';
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile);
        else { loading = null; script.remove(); reject(new Error('Security check did not initialize.')); }
      };
      script.onerror = () => { loading = null; script.remove(); reject(new Error('Security check could not load. Please refresh and try again.')); };
      document.head.appendChild(script);
    });
    return loading;
  }
  async function render(element, options = {}) {
    if (widgets.has(element)) return widgets.get(element);
    const pending = load().then(api => {
      if (!element.isConnected) { widgets.delete(element); return null; }
      const sitekey = String(window.siteConfig?.turnstileSiteKey || '').trim();
      if (!sitekey || /^replace-/.test(sitekey)) throw new Error('Security check is not configured.');
      const id = api.render(element, {
        sitekey, size: element.clientWidth > 0 && element.clientWidth < 300 ? 'compact' : 'flexible',
        ...options,
      });
      element.dataset.widgetId = String(id);
      return id;
    }).catch(error => { widgets.delete(element); throw error; });
    widgets.set(element, pending);
    return pending;
  }
  function reset(root) {
    const elements = root.matches?.('[data-widget-id]') ? [root] : root.querySelectorAll('[data-widget-id]');
    elements.forEach(element => {
      if (window.turnstile) window.turnstile.reset(element.dataset.widgetId);
    });
  }
  function remove(element) {
    if (element?.dataset.widgetId && window.turnstile) window.turnstile.remove(element.dataset.widgetId);
    if (element) { widgets.delete(element); delete element.dataset.widgetId; }
  }
  window.JPPTurnstile = Object.freeze({ load, render, reset, remove });
})();
