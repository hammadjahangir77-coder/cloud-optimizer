/**
 * Firebase Hosting only serves static files. Your Express API must run elsewhere (Render,
 * Railway, Fly.io, Cloud Run, your PC with ngrok, etc.).
 *
 * After you deploy the API, set the origin below (no trailing slash). Then redeploy Hosting.
 *
 * Examples:
 *   window.API_BASE_URL = "https://cloud-optimizer-api.onrender.com";
 *   window.API_BASE_URL = "https://xxxxx.ngrok-free.app";
 *
 * Leave empty when you open the site from the same machine as npm start (localhost).
 */
window.API_BASE_URL = window.API_BASE_URL || "";
