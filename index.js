// index.js - FINAL CLEANUP VERSION
const express = require("express");
const cookieSession = require("cookie-session");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");
const admin = require("firebase-admin");

// --- 1. INITIALISIERUNG ---
const app = express();
const port = process.env.PORT || 10000;

// --- 2. FIREBASE ADMIN SDK ---
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK erfolgreich initialisiert.");
} catch (e) {
    console.error("KRITISCHER FEHLER: Firebase Admin SDK konnte nicht initialisiert werden!", e);
    process.exit(1);
}
const db = admin.firestore();

// --- 3. GOOGLE OAUTH CLIENT ---
const GOOGLE_CLIENT_ID = "992401028690-c46gunffukgdkg30ehns8fhr4j1hi82p.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const EXTENSION_ORIGIN = `chrome-extension://nhpdilfjmlimojgffhnfjpoalhhnbomh`;

// --- 4. MIDDLEWARE (KORREKTE REIHENFOLGE) ---

// WICHTIG: Vertraue dem ersten Proxy (das ist bei Render der Fall)
app.set('trust proxy', 1);

// A. CORS muss als erstes kommen.
app.use(
  cors({
    origin: EXTENSION_ORIGIN,
    credentials: true,
  })
);

// B. Body Parser für JSON
app.use(express.json());

// C. Cookie Session
app.use(
  cookieSession({
    name: "myprompt-session",
    secret: "dies-ist-ein-neuer-und-sehr-sicherer-geheimschluessel",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
    httpOnly: true,
    secure: true,   // Muss 'true' sein, da Render HTTPS verwendet
    sameSite: 'none', // Muss 'none' sein für Cross-Site-Cookies
  } )
);

// --- 5. ROUTEN ---

// Test-Route
app.get("/", (req, res) => {
  res.send("Auth-Server ist online! (Clean-Version)");
});

// Login-Route
app.post("/login", async (req, res) => {
  console.log("--- /login Route wurde aufgerufen ---");
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    return res.status(401).json({ success: false, error: "Kein ID-Token." });
  }
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const user = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
    req.session.user = user; // Hier wird das Cookie gesetzt
    console.log(`Login erfolgreich, Cookie für ${user.email} gesetzt.`);
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Fehler bei Token-Verifizierung:", error.message);
    res.status(401).json({ success: false, error: "Ungültiges ID-Token." });
  }
});

// Middleware zur Authentifizierungsprüfung für alle folgenden Routen
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        console.log("Auth-Fehler: Kein User in der Session gefunden.");
        return res.status(401).json({ error: "Authentifizierung erforderlich." });
    }
    console.log(`Auth erfolgreich für User: ${req.session.user.email}`);
    next();
};

// User-Route (prüft die Session)
app.get("/user", requireAuth, (req, res) => {
    res.status(200).json({ user: req.session.user });
});

// Prompt-Routen (jetzt geschützt)
app.get("/prompts", requireAuth, async (req, res) => {
    const userId = req.session.user.googleId;
    try {
        const snapshot = await db.collection('users').doc(userId).collection('prompts').get();
        const prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(prompts);
    } catch (error) {
        console.error("Fehler beim Laden der Prompts:", error);
        res.status(500).json({ error: "Konnte Prompts nicht laden." });
    }
});

app.post("/prompts", requireAuth, async (req, res) => {
    const userId = req.session.user.googleId;
    const promptData = req.body;
    try {
        const docRef = await db.collection('users').doc(userId).collection('prompts').add(promptData);
        res.status(201).json({ id: docRef.id, ...promptData });
    } catch (error) {
        console.error("Fehler beim Speichern des Prompts:", error);
        res.status(500).json({ error: "Konnte Prompt nicht speichern." });
    }
});

// Logout-Route
app.post("/logout", (req, res) => {
  req.session = null;
  console.log("Logout erfolgreich.");
  res.status(200).json({ success: true });
});

// --- 6. SERVER STARTEN ---
app.listen(port, () => {
  console.log(`MYPROMPT Auth-Server (CLEAN) läuft auf Port ${port}`);
});
