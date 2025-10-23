// index.js - FINALE VERSION MIT FIRESTORE
const express = require("express");
const cookieSession = require("cookie-session");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");
const admin = require("firebase-admin");

// --- INITIALISIERUNG ---
const app = express();
const port = process.env.PORT || 10000;

// Firebase Admin SDK initialisieren
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK erfolgreich initialisiert.");
} catch (e) {
    console.error("Firebase Admin SDK Initialisierung fehlgeschlagen!", e);
    // Beenden, wenn die DB-Verbindung nicht hergestellt werden kann.
    process.exit(1); 
}
const db = admin.firestore();

const GOOGLE_CLIENT_ID = "992401028690-c46gunffukgdkg30ehns8fhr4j1hi82p.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const EXTENSION_ID = "nhpdilfjmlimojgffhnfjpoalhhnbomh";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

// --- MIDDLEWARE ---
const corsOptions = {
  origin: EXTENSION_ORIGIN,
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(
  cookieSession({
    name: "myprompt-session-v2",
    secret: "ein-neuer-geheimer-string-fuer-firestore",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: "none",
  } )
);

// Middleware, um zu prüfen, ob ein Nutzer eingeloggt ist
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Authentifizierung erforderlich." });
    }
    next();
};

// --- ROUTEN ---

app.post("/login", async (req, res) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) return res.status(401).json({ success: false, error: "Kein ID-Token." });

    try {
        const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const user = {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
        };
        req.session.user = user;
        console.log(`Login erfolgreich für: ${user.email}`);
        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("Fehler bei Token-Verifizierung:", error.message);
        res.status(401).json({ success: false, error: "Ungültiges ID-Token." });
    }
});

app.get("/user", requireAuth, (req, res) => {
    res.status(200).json({ user: req.session.user });
});

app.post("/logout", (req, res) => {
    req.session = null;
    console.log("Logout erfolgreich.");
    res.status(200).json({ success: true });
});

// --- PROMPT-ROUTEN ---

// Alle Prompts für den eingeloggten Nutzer holen
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

// Einen neuen Prompt hinzufügen
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

// ... Hier könnten später Routen für das Aktualisieren und Löschen von Prompts hinzukommen ...

app.listen(port, () => {
    console.log(`MYPROMPT Auth-Server mit Firestore läuft auf Port ${port}`);
});
