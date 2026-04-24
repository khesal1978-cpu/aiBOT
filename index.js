const cron = require('node-cron');
const db = require('./db');
const { startAdminServer } = require('./admin');
const { bot } = require('./bot');

async function main() {
  console.log('Initializing Database...');
  await db.initDB();
  console.log('Database initialized successfully.');

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
