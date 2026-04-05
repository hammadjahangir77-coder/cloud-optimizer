const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: true,
});

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  tagline TEXT,
  industry TEXT,
  description TEXT,
  founded_year INTEGER,
  website TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  employee_count INTEGER,
  monthly_cloud_budget REAL,
  cloud_providers TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);
`);

(function migrateBusinesses() {
  const cols = db.prepare("PRAGMA table_info(businesses)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("advisor_answers")) {
    db.exec("ALTER TABLE businesses ADD COLUMN advisor_answers TEXT");
  }
  if (!names.has("service_level")) {
    db.exec("ALTER TABLE businesses ADD COLUMN service_level TEXT");
  }
  if (!names.has("has_it_manager")) {
    db.exec("ALTER TABLE businesses ADD COLUMN has_it_manager INTEGER DEFAULT 0");
  }
  if (!names.has("primary_issues")) {
    db.exec("ALTER TABLE businesses ADD COLUMN primary_issues TEXT");
  }
})();

(function migrateUsers() {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("firebase_uid")) {
    db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)"
    );
  }
})();

module.exports = db;
