const cron = require('node-cron');
const db = require('./db');
const { startAdminServer } = require('./admin');
const { bot } = require('./bot');

async function main() {
  console.log('Initializing Database...');
  await db.initDB();
  console.log('Database initialized successfully.');

  // Auto-sync images from GitHub folder to DB
  console.log('Syncing images from source...');
  const count = await db.autoSyncImages();
  console.log(`Synced ${count} images to database.`);

  // If on Render, copy images from source to persistent disk
  if (process.env.RENDER_DISK_PATH) {
    try {
      const fs = require('fs');
      const path = require('path');
      const sourceDir = path.join(__dirname, 'images');
      const targetDir = path.join(process.env.RENDER_DISK_PATH, 'images');

      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      if (fs.existsSync(sourceDir)) {
        const files = fs.readdirSync(sourceDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
        files.forEach(f => {
          const targetPath = path.join(targetDir, f);
          if (!fs.existsSync(targetPath)) {
            fs.copyFileSync(path.join(sourceDir, f), targetPath);
          }
        });
        console.log('Images copied to persistent storage.');
      }
    } catch (err) {
      console.warn('[Storage] Could not sync images to persistent disk. Continuing with local files.');
    }
  }

  console.log('Starting Admin Server...');
  startAdminServer();

  console.log('Starting Telegram Bot...');
  bot.launch().then(() => {
    console.log('Telegram Bot is running!');
  }).catch(err => {
    console.error('Failed to start Telegram Bot:', err);
  });

  // Maintenance: Daily Reset at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    console.log('[Maintenance] Running daily reset...');
    await db.globalDailyReset();
  });

  // Maintenance: DB Cleanup at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('[Maintenance] Running DB cleanup...');
    await db.cleanupHistory();
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(console.error);
