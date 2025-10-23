// index.js - FINALE SERVER-VERSION FÜR RENDER.COM
const express = require("express");
const cookieSession = require("cookie-session");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");

const app = express();
// Render.com setzt die PORT-Umgebungsvariable. Wir nutzen sie oder fallen auf 10000 zurück.
const port = process.env.PORT || 10000;

// --- KONFIGURATION ---
const GOOGLE_CLIENT_ID = "992401028690-c46gunffukgdkg30ehns8fhr4j1hi82p.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const EXTENSION_ID = "nhpdilfjmlimojgffhnfjpoalhhnbomh";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

// --- MIDDLEWARE ---

// 1. Robuste CORS-Konfiguration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      console.error('CORS blockiert für Origin:', origin);
      callback(new Error('Nicht durch CORS erlaubt'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Wichtig für Preflight-Anfragen

// 2. Body Parser für JSON
app.use(express.json());

// 3. Cookie Session
app.use(
  cookieSession({
    name: "myprompt-session",
    secret: "ein-wirklich-sehr-geheimer-string-fuer-arnoldas-auf-render",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
    httpOnly: true,
    // Da Render über HTTPS läuft, MUSS 'secure' auf true sein.
    secure: true, 
    sameSite: "none",
  } )
);

// --- ROUTEN ---

app.post("/login", async (req, res) => {
  console.log("--- /login Route wurde aufgerufen ---");
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    return res.status(401).json({ success: false, error: "Kein ID-Token bereitgestellt." });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const user = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
    req.session.user = user;
    console.log(`Login erfolgreich für: ${user.email}`);
    res.status(200).json({ success: true, user: user });
  } catch (error) {
    console.error("Fehler bei der Token-Verifizierung:", error.message);
    res.status(401).json({ success: false, error: "Ungültiges ID-Token." });
  }
});

app.get("/user", (req, res) => {
  if (req.session && req.session.user) {
    res.status(200).json({ user: req.session.user });
  } else {
    res.status(401).json({ error: "Nicht authentifiziert." });
  }
});

app.post("/logout", (req, res) => {
  req.session = null;
  console.log("Logout erfolgreich.");
  res.status(200).json({ success: true });
});

// Test-Route
app.get("/", (req, res) => {
  res.send("Auth-Server ist online! (Render.com Version)");
});

app.listen(port, () => {
  console.log(`MYPROMPT Auth-Server läuft auf Port ${port}`);
});
