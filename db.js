const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Smart Database Path Selection
let dbPath;
const renderDiskPath = process.env.RENDER_DISK_PATH;

if (renderDiskPath) {
  const diskPath = path.join(renderDiskPath, 'database.db');
  try {
    // Check if the directory exists and is writable
    if (!fs.existsSync(renderDiskPath)) {
      fs.mkdirSync(renderDiskPath, { recursive: true });
    }
    // Test write permission
    fs.accessSync(renderDiskPath, fs.constants.W_OK);
    dbPath = diskPath;
  } catch (err) {
    console.warn(`[DB] Warning: ${renderDiskPath} is not writable. Falling back to local storage.`);
    dbPath = path.join(__dirname, 'database.db');
  }
} else {
  dbPath = path.join(__dirname, 'database.db');
}

console.log(`[DB] Opening database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

function initDB() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table with onboarding and premium expiry
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        is_premium INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        referred_by TEXT,
        msgs_today INTEGER DEFAULT 0,
        imgs_today INTEGER DEFAULT 0,
        last_reset TEXT,
        referral_bonus_msgs INTEGER DEFAULT 0,
        referral_bonus_imgs INTEGER DEFAULT 0,
        last_img_time INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        language TEXT DEFAULT 'Hinglish',
        has_agreed INTEGER DEFAULT 0,
        joined_channel INTEGER DEFAULT 0,
        total_messages_all_time INTEGER DEFAULT 0,
        premium_expires DATETIME
      )`);

      // Images table
      db.run(`CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        usage_count INTEGER DEFAULT 0
      )`);

      // Viewed images tracking
      db.run(`CREATE TABLE IF NOT EXISTS viewed_images (
        user_id TEXT,
        image_id INTEGER,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, image_id)
      )`);

      // Chat memory / Conversations
      db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Tokens pool for dynamic rotation
      db.run(`CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'Active'
      )`);

      // Messages / Stats tracking
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function getUser(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      
      const today = getTodayStr();
      if (row.last_reset !== today) {
        db.run('UPDATE users SET msgs_today = 0, imgs_today = 0, last_reset = ? WHERE id = ?', [today, id], (err) => {
          if (err) reject(err);
          else {
            row.msgs_today = 0;
            row.imgs_today = 0;
            row.last_reset = today;
            resolve(row);
          }
        });
      } else {
        resolve(row);
      }
    });
  });
}

async function createUser(id, username, referred_by = null) {
  return new Promise((resolve, reject) => {
    const today = getTodayStr();
    db.run(
      'INSERT OR IGNORE INTO users (id, username, referred_by, last_reset) VALUES (?, ?, ?, ?)',
      [id, username, referred_by, today],
      function (err) {
        if (err) return reject(err);
        
        if (this.changes > 0 && referred_by) {
          db.run(
            'UPDATE users SET referral_bonus_msgs = referral_bonus_msgs + 12, referral_bonus_imgs = referral_bonus_imgs + 4 WHERE id = ?',
            [referred_by]
          );
        }
        resolve(this.changes > 0);
      }
    );
  });
}

function getLimits(user) {
  // Check premium expiry
  let isPremiumActive = user.is_premium === 1;
  if (user.premium_expires && new Date(user.premium_expires) < new Date()) {
    isPremiumActive = false;
    // Auto-downgrade in DB if expired
    db.run('UPDATE users SET is_premium = 0 WHERE id = ?', [user.id]);
  }

  const baseMsgs = isPremiumActive ? 250 : 17;
  const baseImgs = isPremiumActive ? 60 : 3;
  return {
    msgsLimit: baseMsgs + user.referral_bonus_msgs,
    imgsLimit: baseImgs + user.referral_bonus_imgs,
    isPremium: isPremiumActive
  };
}

async function checkMessageLimit(id) {
  const user = await getUser(id);
  if (!user) return { allowed: false, reason: 'user_not_found' };
  if (user.is_banned) return { allowed: false, reason: 'banned' };

  const limits = getLimits(user);
  if (user.msgs_today >= limits.msgsLimit) {
    return { allowed: false, reason: 'limit_reached' };
  }
  return { allowed: true, user, limits };
}

async function incrementMessages(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET msgs_today = msgs_today + 1, total_messages_all_time = total_messages_all_time + 1 WHERE id = ?', [id]);
    db.run('INSERT INTO messages (user_id) VALUES (?)', [id], err => err ? reject(err) : resolve());
  });
}

async function checkImageLimit(id) {
  const user = await getUser(id);
  if (!user) return { allowed: false, reason: 'user_not_found' };
  if (user.is_banned) return { allowed: false, reason: 'banned' };

  const limits = getLimits(user);
  if (user.imgs_today >= limits.imgsLimit) {
    return { allowed: false, reason: 'limit_reached' };
  }

  const now = Date.now();
  if (now - user.last_img_time < 60000) {
    return { allowed: false, reason: 'cooldown', wait: Math.ceil((60000 - (now - user.last_img_time)) / 1000) };
  }

  return { allowed: true, user, limits };
}

async function incrementImagesAndSetCooldown(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET imgs_today = imgs_today + 1, last_img_time = ? WHERE id = ?', [Date.now(), id], err => err ? reject(err) : resolve());
  });
}

async function getNextImage(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM images WHERE id NOT IN (SELECT image_id FROM viewed_images WHERE user_id = ?) ORDER BY uploaded_at ASC LIMIT 1`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row);

        db.get('SELECT * FROM images ORDER BY uploaded_at DESC LIMIT 1', [], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      }
    );
  });
}

async function markImageAsViewed(user_id, image_id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE images SET usage_count = usage_count + 1 WHERE id = ?', [image_id]);
    db.run('INSERT OR IGNORE INTO viewed_images (user_id, image_id) VALUES (?, ?)', [user_id, image_id], err => err ? reject(err) : resolve());
  });
}

// Conversation Memory
async function saveConversation(user_id, role, content) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)', [user_id, role, content], err => err ? reject(err) : resolve());
  });
}

async function getChatHistory(user_id, limit = 8) {
  return new Promise((resolve, reject) => {
    db.all('SELECT role, content FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?', [user_id, limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.reverse()); // Return in chronological order
    });
  });
}

// Onboarding & Language
async function updateOnboarding(id, field, value) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE users SET ${field} = ? WHERE id = ?`, [value, id], err => err ? reject(err) : resolve());
  });
}

// Maintenance
async function globalDailyReset() {
  const today = getTodayStr();
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET msgs_today = 0, imgs_today = 0, last_reset = ?', [today], err => err ? reject(err) : resolve());
  });
}

async function cleanupHistory() {
  return new Promise((resolve, reject) => {
    // Keep only last 50 messages per user
    db.run(`
      DELETE FROM conversations 
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn 
          FROM conversations
        ) WHERE rn <= 50
      )
    `, err => err ? reject(err) : resolve());
  });
}

// Admin stats
async function getGlobalStats() {
  return new Promise((resolve, reject) => {
    const stats = {};
    db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
      stats.totalUsers = row.total;
      db.get('SELECT COUNT(*) as total FROM users WHERE is_premium = 1', (err, row) => {
        stats.premiumUsers = row.total;
        db.get('SELECT COUNT(*) as total FROM users WHERE is_banned = 1', (err, row) => {
          stats.bannedUsers = row.total;
          db.get('SELECT COUNT(*) as total FROM messages WHERE date(timestamp) = date("now")', (err, row) => {
            stats.dailyMessages = row.total;
            resolve(stats);
          });
        });
      });
    });
  });
}

async function resetDailyCredits(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET msgs_today = 0, imgs_today = 0 WHERE id = ?', [id], err => err ? reject(err) : resolve());
  });
}

async function searchUsers(query) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users WHERE id LIKE ? OR username LIKE ? LIMIT 50', [`%${query}%`, `%${query}%`], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// Premium Upgrade
async function upgradeToPremium(id, months = 1) {
  const now = new Date();
  const expiry = new Date(now.setMonth(now.getMonth() + months)).toISOString();
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET is_premium = 1, premium_expires = ? WHERE id = ?', [expiry, id], err => err ? reject(err) : resolve());
  });
}

// Existing Admin functions
async function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users ORDER BY created_at DESC LIMIT 100', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function banUser(id, is_banned) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET is_banned = ? WHERE id = ?', [is_banned, id], err => err ? reject(err) : resolve());
  });
}

async function setPremium(id, is_premium) {
  return new Promise((resolve, reject) => {
    if (is_premium) {
      const expiry = new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString(); // 10 years for manual
      db.run('UPDATE users SET is_premium = 1, premium_expires = ? WHERE id = ?', [expiry, id], err => err ? reject(err) : resolve());
    } else {
      db.run('UPDATE users SET is_premium = 0, premium_expires = NULL WHERE id = ?', [id], err => err ? reject(err) : resolve());
    }
  });
}

async function addImage(filename) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO images (filename) VALUES (?)', [filename], err => err ? reject(err) : resolve());
  });
}

async function getAllImages() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM images ORDER BY uploaded_at DESC', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function addToken(token) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO tokens (token) VALUES (?)', [token], err => err ? reject(err) : resolve());
  });
}

async function removeToken(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tokens WHERE id = ?', [id], err => err ? reject(err) : resolve());
  });
}

async function getAllTokens() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tokens ORDER BY added_at DESC', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function autoSyncImages() {
  const fs = require('fs');
  const IMAGES_DIR = process.env.RENDER_DISK_PATH 
    ? path.join(__dirname, 'images') // Read from source first
    : path.join(__dirname, 'images');

  if (!fs.existsSync(IMAGES_DIR)) return;

  const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  
  return new Promise((resolve) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO images (filename) VALUES (?)');
    files.forEach(f => stmt.run(f));
    stmt.finalize(() => resolve(files.length));
  });
}

module.exports = {
  db,
  initDB,
  getUser,
  createUser,
  checkMessageLimit,
  incrementMessages,
  checkImageLimit,
  incrementImagesAndSetCooldown,
  getNextImage,
  markImageAsViewed,
  getAllUsers,
  banUser,
  setPremium,
  addImage,
  getAllImages,
  getLimits,
  saveConversation,
  getChatHistory,
  updateOnboarding,
  getGlobalStats,
  resetDailyCredits,
  searchUsers,
  globalDailyReset,
  cleanupHistory,
  upgradeToPremium,
  addToken,
  removeToken,
  getAllTokens,
  autoSyncImages
};
