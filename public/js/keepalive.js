/* ── SkyCare Client Keepalive ── */

(function initKeepalive() {
  const enabled = String(localStorage.getItem('skycare_keepalive_enabled') || 'true').toLowerCase() === 'true';
  if (!enabled) return;

  const intervalMs = 4 * 60 * 1000;
  const pingUrl = '/healthz';
  let pingTimer = null;

  const ping = async () => {
    try {
      await fetch(pingUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive: true,
      });
    } catch (_) {
      // Ignore transient network errors; the next cycle will retry.
    }
  };

  const schedule = () => {
    if (pingTimer) return;
    ping();
    pingTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        ping();
      }
    }, intervalMs);
  };

  const stop = () => {
    if (!pingTimer) return;
    clearInterval(pingTimer);
    pingTimer = null;
  };

  window.addEventListener('focus', ping, { passive: true });
  window.addEventListener('online', ping, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ping();
  });
  window.addEventListener('pagehide', stop, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
})();