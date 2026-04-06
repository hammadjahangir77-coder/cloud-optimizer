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
    const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : null;
    const candidatePaths = explicitPath
      ? [explicitPath]
      : [
          path.join(__dirname, "firebase-service-account.json"),
          path.join(__dirname, "firebase-service-account.json.json"),
        ];
    const jsonPath = candidatePaths.find((p) => fs.existsSync(p));
    if (jsonPath) {
      const sa = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
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
