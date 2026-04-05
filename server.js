const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { getFirebaseAdmin } = require("./firebaseAdmin");
const { normalizeAnswers, computeReport } = require("./advisorEngine");

const app = express();
const BASE_PORT = Number(process.env.PORT) || 3000;
const PORT_TRY_LIMIT = 20;
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-only-change-me-in-production";
const SALT_ROUNDS = 10;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/index.html");
});

function insertRowId(info) {
  const x = info.lastInsertRowid;
  return typeof x === "bigint" ? Number(x) : x;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: "Missing or invalid authorization" });
  }
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/api/auth/register", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  if (username.length < 2) {
    return res.status(400).json({ error: "Username must be at least 2 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
  try {
    const info = db
      .prepare(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)"
      )
      .run(username, password_hash);
    const user = { id: insertRowId(info), username };
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    throw e;
  }
});

app.post("/api/auth/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE")
    .get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const user = { id: row.id, username: row.username };
  res.json({ token: signToken(user), user });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ id: req.userId, username: req.username });
});

app.post("/api/auth/firebase", async (req, res) => {
  const admin = getFirebaseAdmin();
  if (!admin) {
    return res.status(503).json({
      error:
        "Firebase sign-in is not set up on the server. Download a service account JSON from Firebase Console (Project settings → Service accounts) and save it as firebase-service-account.json in the project root, then restart npm start.",
    });
  }
  const idToken = req.body && req.body.idToken;
  if (!idToken || typeof idToken !== "string") {
    return res.status(400).json({ error: "Missing idToken" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = (decoded.email || "").trim().toLowerCase();
    if (!email) {
      return res
        .status(400)
        .json({ error: "This sign-in method did not provide an email address" });
    }
    let row = db
      .prepare(
        "SELECT id, username, password_hash, firebase_uid FROM users WHERE firebase_uid = ?"
      )
      .get(uid);
    if (!row) {
      row = db
        .prepare(
          "SELECT id, username, password_hash, firebase_uid FROM users WHERE username = ? COLLATE NOCASE"
        )
        .get(email);
      if (row) {
        if (row.firebase_uid && row.firebase_uid !== uid) {
          return res.status(409).json({
            error: "This email is already linked to a different Firebase account",
          });
        }
        db.prepare("UPDATE users SET firebase_uid = ? WHERE id = ?").run(uid, row.id);
        row.firebase_uid = uid;
      } else {
        const placeholder = bcrypt.hashSync(
          crypto.randomBytes(24).toString("hex"),
          SALT_ROUNDS
        );
        const info = db
          .prepare(
            "INSERT INTO users (username, password_hash, firebase_uid) VALUES (?, ?, ?)"
          )
          .run(email, placeholder, uid);
        row = {
          id: insertRowId(info),
          username: email,
          password_hash: placeholder,
          firebase_uid: uid,
        };
      }
    }
    const user = { id: row.id, username: row.username };
    res.json({ token: signToken(user), user });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Invalid or expired Firebase sign-in. Try again." });
  }
});

app.get("/api/advisor/capabilities", (req, res) => {
  res.json({
    openai: Boolean(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
});

async function openAiNarrative(report) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You help small business owners understand cloud cost optimisation. Rules: (1) Do not invent dollar amounts beyond the JSON. (2) Call savings illustrative or survey-based. (3) Two short paragraphs, plain English. (4) Say provider ranking is a heuristic suggestion, not official vendor advice. (5) Align tone with academic/industry caution.",
      },
      {
        role: "user",
        content:
          "Summarise this advisory report JSON for the owner:\n" +
          JSON.stringify(report).slice(0, 14000),
      },
    ],
    max_tokens: 500,
    temperature: 0.35,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  const j = await r.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return (text && String(text).trim()) || null;
}

app.get("/api/businesses", authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, user_id, name, legal_name, tagline, industry, description,
              founded_year, website, email, phone, address, employee_count,
              monthly_cloud_budget, cloud_providers, notes, advisor_answers,
              service_level, has_it_manager, primary_issues,
              created_at, updated_at
       FROM businesses WHERE user_id = ? ORDER BY name COLLATE NOCASE`
    )
    .all(req.userId);
  res.json(rows);
});

app.get("/api/businesses/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT id, user_id, name, legal_name, tagline, industry, description,
              founded_year, website, email, phone, address, employee_count,
              monthly_cloud_budget, cloud_providers, notes, advisor_answers,
              service_level, has_it_manager, primary_issues,
              created_at, updated_at
       FROM businesses WHERE id = ? AND user_id = ?`
    )
    .get(id, req.userId);
  if (!row) return res.status(404).json({ error: "Business not found" });
  res.json(row);
});

function pickBusinessBody(body) {
  const allowed = [
    "name",
    "legal_name",
    "tagline",
    "industry",
    "description",
    "founded_year",
    "website",
    "email",
    "phone",
    "address",
    "employee_count",
    "monthly_cloud_budget",
    "cloud_providers",
    "notes",
    "service_level",
    "has_it_manager",
    "primary_issues",
  ];
  const out = {};
  for (const k of allowed) {
    if (body[k] === undefined) continue;
    let v = body[k];
    if (k === "founded_year" || k === "employee_count") {
      v = v === "" || v === null ? null : Number(v);
      if (v !== null && !Number.isFinite(v)) v = null;
    }
    if (k === "monthly_cloud_budget") {
      v = v === "" || v === null ? null : Number(v);
      if (v !== null && !Number.isFinite(v)) v = null;
    }
    if (k === "has_it_manager") {
      v = v === true || v === 1 || v === "1" ? 1 : 0;
    }
    if (k === "service_level") {
      const s = String(v || "").toLowerCase();
      v = ["saas", "paas", "iaas"].includes(s) ? s : null;
    }
    if (k === "primary_issues") {
      if (Array.isArray(v)) {
        const ok = ["unexpected_bills", "complex_reporting", "over_provisioned"];
        v = JSON.stringify(v.filter((x) => ok.includes(x)));
      } else if (typeof v === "string") {
        v = v.trim() || null;
      } else {
        v = null;
      }
    }
    if (typeof v === "string" && k !== "primary_issues") v = v.trim();
    out[k] = v;
  }
  return out;
}

app.post("/api/businesses", authMiddleware, (req, res) => {
  const data = pickBusinessBody(req.body);
  if (!data.name || String(data.name).length === 0) {
    return res.status(400).json({ error: "Business name is required" });
  }
  const cols = ["user_id", ...Object.keys(data)];
  const placeholders = cols.map(() => "?").join(", ");
  const values = [req.userId, ...Object.values(data)];
  const info = db
    .prepare(
      `INSERT INTO businesses (${cols.join(", ")}) VALUES (${placeholders})`
    )
    .run(...values);
  const row = db
    .prepare("SELECT * FROM businesses WHERE id = ?")
    .get(insertRowId(info));
  res.status(201).json(row);
});

app.patch("/api/businesses/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare("SELECT id FROM businesses WHERE id = ? AND user_id = ?")
    .get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Business not found" });
  const data = pickBusinessBody(req.body);
  if (Object.keys(data).length === 0) {
    const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
    return res.json(row);
  }
  if (data.name !== undefined && String(data.name).length === 0) {
    return res.status(400).json({ error: "Business name cannot be empty" });
  }
  data.updated_at = new Date().toISOString();
  const sets = Object.keys(data)
    .map((k) => `${k} = ?`)
    .join(", ");
  const values = [...Object.values(data), id, req.userId];
  db.prepare(
    `UPDATE businesses SET ${sets} WHERE id = ? AND user_id = ?`
  ).run(...values);
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  res.json(row);
});

app.delete("/api/businesses/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare("DELETE FROM businesses WHERE id = ? AND user_id = ?")
    .run(id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: "Business not found" });
  res.status(204).end();
});

app.post("/api/businesses/:id/advisor", authMiddleware, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = db
      .prepare("SELECT * FROM businesses WHERE id = ? AND user_id = ?")
      .get(id, req.userId);
    if (!row) return res.status(404).json({ error: "Business not found" });

    const answers = normalizeAnswers(req.body.answers || {});
    const answersJson = JSON.stringify(answers);
    db.prepare(
      "UPDATE businesses SET advisor_answers = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(answersJson, new Date().toISOString(), id, req.userId);

    const fresh = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
    const report = computeReport(fresh, answers);

    let aiNarrative = null;
    let aiError = null;
    if (req.body.includeAi && process.env.OPENAI_API_KEY) {
      try {
        aiNarrative = await openAiNarrative(report);
      } catch (e) {
        aiError = e.message || "AI request failed";
      }
    }

    res.json({
      report,
      aiNarrative,
      aiError,
      aiUsed: Boolean(aiNarrative),
    });
  } catch (e) {
    next(e);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

function startServer(port, attempt) {
  if (attempt >= PORT_TRY_LIMIT) {
    console.error(
      `No free port found between ${BASE_PORT} and ${BASE_PORT + PORT_TRY_LIMIT - 1}.`
    );
    console.error(
      'Free a port (PowerShell): Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }'
    );
    process.exit(1);
  }
  const server = app.listen(port);
  server.once("listening", () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port}/index.html (Cloud Optimizer home)`);
    if (!process.env.JWT_SECRET) {
      console.warn("Using default JWT_SECRET; set JWT_SECRET in production.");
    }
    if (process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key set — advisor can generate AI summaries.");
    } else {
      console.log("Optional: set OPENAI_API_KEY for AI-written advisor summaries.");
    }
  });
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
      startServer(port + 1, attempt + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

startServer(BASE_PORT, 0);
