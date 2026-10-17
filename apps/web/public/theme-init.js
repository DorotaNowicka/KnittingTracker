// Applies the saved theme and language before the first paint (no flash). Loaded as an external
// script because the CSP forbids inline scripts. Storage may be blocked: fail silently.
(function () {
  try {
    var theme = localStorage.getItem('kt.theme');
    if (theme === 'light' || theme === 'dark')
      document.documentElement.setAttribute('data-theme', theme);
    var lang = localStorage.getItem('kt.lang');
    if (lang === 'en' || lang === 'pl') document.documentElement.lang = lang;
  } catch {
    /* ignore */
  }
})();
