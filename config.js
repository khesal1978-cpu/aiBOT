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
  GROQ_TOKENS: [
    process.env.GROQ_TOKEN,
    process.env.GROQ_TOKEN_2,
    process.env.GROQ_TOKEN_3,
    process.env.GROQ_TOKEN_4,
    process.env.GROQ_TOKEN_5,
    process.env.GROQ_TOKEN_6,
  ].filter(Boolean),
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS || 'jannat123',
  PORT: process.env.PORT || 5000,
};
