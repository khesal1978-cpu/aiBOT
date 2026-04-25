const express = require('express');
const basicAuth = require('express-basic-auth');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const config = require('./config');
const api = require('./api');
const fs = require('fs');

const app = express();
const ADMIN_PORT = config.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic Auth
app.use(basicAuth({
  users: { [config.ADMIN_USER]: config.ADMIN_PASS },
  challenge: true
}));

// Storage Setup
const IMAGES_DIR = process.env.RENDER_DISK_PATH 
  ? path.join(process.env.RENDER_DISK_PATH, 'images')
  : path.join(__dirname, 'images');

try {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    console.log(`[Storage] Directory ready at: ${IMAGES_DIR}`);
  }
} catch (err) {
  console.warn(`[Storage] Permission denied for ${IMAGES_DIR}. Using local fallback.`);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMAGES_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
});

// Root & Health
app.get('/', (req, res) => res.redirect('/admin.html'));
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- API ROUTES ---

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getGlobalStats();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Users
app.get('/api/users', async (req, res) => {
  try {
    const query = req.query.q;
    const users = query ? await db.searchUsers(query) : await db.getAllUsers();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:id/ban', async (req, res) => {
  try {
    await db.banUser(req.params.id, req.body.is_banned ? 1 : 0);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:id/premium', async (req, res) => {
  try {
    await db.setPremium(req.params.id, req.body.is_premium ? 1 : 0);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Images
app.get('/api/images', async (req, res) => {
  try {
    const images = await db.getAllImages();
    res.json(images);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/images', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    await db.addImage(req.file.filename);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GROQ TOKEN MANAGEMENT (REAL-TIME) ---
app.get('/api/config-status', async (req, res) => {
  try {
    const dbTokens = await db.getAllTokens();
    const allTokens = [
      ...config.GROQ_TOKENS.map(t => ({ token: t, type: 'Env' })),
      ...dbTokens.map(t => ({ token: t.token, type: 'DB', id: t.id }))
    ];
    
    const health = await Promise.all(allTokens.map(async (t, i) => {
      const ok = await api.testToken(t.token);
      return { 
        index: i + 1, 
        status: ok ? 'Active' : 'Offline', 
        type: t.type, 
        id: t.id,
        masked: t.token.substring(0, 8) + '...'
      };
    }));
    
    res.json({ 
      model: 'Llama 3.3 70B', 
      tokens: health,
      storage: process.env.RENDER_DISK_PATH ? 'Persistent' : 'Local'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tokens', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    await db.addToken(token);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tokens/:id', async (req, res) => {
  try {
    await db.removeToken(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function startAdminServer() {
  app.listen(ADMIN_PORT, () => {
    console.log(`Admin dashboard running on http://localhost:${ADMIN_PORT}`);
  });
}

module.exports = { startAdminServer };
