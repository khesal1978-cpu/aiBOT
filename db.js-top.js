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
    // Test write permission by opening/creating a dummy file
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
