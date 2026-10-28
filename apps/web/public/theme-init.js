// Applies the saved theme and language before the first paint (no flash). Loaded as an external
// script because the CSP forbids inline scripts. Storage may be blocked: fail silently.
(function () {
  try {
    // Keep in sync with THEMES in src/lib/preferences.ts (checked by a unit test).
    var themes = ['light', 'dark', 'moss', 'indigo', 'lamp', 'yarn', 'yarn-night'];
    var theme = localStorage.getItem('kt.theme');
    if (themes.indexOf(theme) >= 0) document.documentElement.setAttribute('data-theme', theme);
    var lang = localStorage.getItem('kt.lang');
    if (lang === 'en' || lang === 'pl') document.documentElement.lang = lang;
  } catch {
    /* ignore */
  }
})();
