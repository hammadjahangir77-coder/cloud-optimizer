/**
 * API base URL used by frontend auth/data calls.
 *
 * Local (localhost): use same-origin backend from `npm start` (API_BASE_URL = "").
 * Hosted frontend (Firebase): point to your deployed API origin.
 */
(function () {
  var host = window.location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1";

  // For local development keep empty so calls go to same origin (e.g. http://localhost:3000/api/*)
  if (isLocal) {
    window.API_BASE_URL = "";
    return;
  }

  // For hosted frontend set your deployed API origin here (no trailing slash).
  window.API_BASE_URL = "https://cloud-optimizer-api.onrender.com";
})();