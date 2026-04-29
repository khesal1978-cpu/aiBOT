require('dotenv').config();

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  // OpenRouter API tokens (replace Groq — org was restricted)
  OR_TOKENS: [
    process.env.OR_TOKEN_1,
    process.env.OR_TOKEN_2,
    process.env.OR_TOKEN_3,
    process.env.OR_TOKEN_4,
    process.env.OR_TOKEN_5,
    process.env.OR_TOKEN_6,
  ].filter(Boolean),
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'jannat123',
  PORT: process.env.PORT || 5000,
};
