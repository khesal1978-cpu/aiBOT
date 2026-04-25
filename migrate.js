const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

const migrations = [
  `ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'Hinglish'`,
  `ALTER TABLE users ADD COLUMN has_agreed INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN joined_channel INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN total_messages_all_time INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN premium_expires DATETIME`,
  `ALTER TABLE users ADD COLUMN roleplay_mode TEXT DEFAULT 'default'`,
  `ALTER TABLE images ADD COLUMN usage_count INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

db.serialize(() => {
  for (const sql of migrations) {
    db.run(sql, (err) => {
      if (err && err.message.includes('duplicate column')) {
        console.log(`[SKIP] Already exists: ${sql.substring(0, 50)}...`);
      } else if (err) {
        console.error(`[ERR] ${err.message}`);
      } else {
        console.log(`[OK] ${sql.substring(0, 60)}...`);
      }
    });
  }
  db.close(() => console.log('\n✅ Migration complete!'));
});
