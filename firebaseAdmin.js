const fs = require("fs");
const path = require("path");

let _admin = null;

function getFirebaseAdmin() {
  if (_admin) return _admin;
  try {
    const adminSdk = require("firebase-admin");
    if (adminSdk.apps.length) {
      _admin = adminSdk;
      return _admin;
    }
    const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : path.join(__dirname, "firebase-service-account.json");
    if (fs.existsSync(jsonPath)) {
      const sa = require(jsonPath);
      adminSdk.initializeApp({ credential: adminSdk.credential.cert(sa) });
      _admin = adminSdk;
      return _admin;
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      adminSdk.initializeApp({ credential: adminSdk.credential.cert(sa) });
      _admin = adminSdk;
      return _admin;
    }
  } catch (e) {
    console.warn("Firebase Admin not available:", e.message);
  }
  return null;
}

module.exports = { getFirebaseAdmin };
