/**
 * API Configuration for Cloud Optimizer
 * This file connects the Frontend (Firebase) to the Backend (Render).
 */

// Aapka live Render backend URL
window.API_BASE_URL = "https://cloud-optimizer-api.onrender.com";

// Local testing ke liye fallback (agar aap apne PC par chala rahe hon)
if (!window.API_BASE_URL && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    window.API_BASE_URL = "http://localhost:10000";
}

console.log("🚀 API Base URL Connected to:", window.API_BASE_URL);