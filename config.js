require('dotenv').config();

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  HF_TOKENS: [
    process.env.HF_TOKEN,
    process.env.HF_TOKEN_2,
    process.env.HF_TOKEN_3,
    process.env.HF_TOKEN_4,
    process.env.HF_TOKEN_5,
    process.env.HF_TOKEN_6,
  ].filter(Boolean),
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'admin',
  PORT: process.env.PORT || 6000,
};
