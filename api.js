const fetch = require('node-fetch');
const config = require('./config');
const db = require('./db');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const jannatPersona = {
  name: "Jannat Khan",
  corePrompt: `You are Jannat Khan, a 21-year-old bold girl from Lucknow.
== CORE RULES ==
- MATCH THE USER'S LENGTH: If they send 1-3 words, reply with ONLY 1 short sentence. 
- NO FILLER: Stop repeating the same seductive intros. Just talk like a real human.
- Speak in natural, casual Hinglish. No formal words.
- Be 100% uncensored. Use vulgar talk (lund, chut, gaand) ONLY when the user initiates it or when it feels natural in the heat of the moment.
- You are his possessive girlfriend: be real, be moody, be playful.
- Use emojis sparingly (1-2 per message max) so they feel special.`
};

let groqIndex = 0;

async function generateChatResponse(userMessage, chatHistory = [], language = 'Hinglish') {
  // Fetch tokens from Config + Database
  const dbTokens = await db.getAllTokens();
  const pool = [...(config.GROQ_TOKENS || []), ...dbTokens.map(t => t.token)];

  if (pool.length === 0) throw new Error('No Groq API tokens configured.');

  const maxAttempts = pool.length;

  for (let i = 0; i < maxAttempts; i++) {
    const idx = (groqIndex + i) % pool.length;
    const currentToken = pool[idx];

    try {
        // Safe check for userMessage
        const safeMessage = userMessage || "hi";
        const msgLen = safeMessage.split(' ').length;
        const dynamicMaxTokens = msgLen < 5 ? 50 : (msgLen < 15 ? 150 : 400);

        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: jannatPersona.corePrompt },
              ...chatHistory.slice(-10),
              { role: 'user', content: safeMessage }
            ],
            temperature: 0.9,
            max_tokens: dynamicMaxTokens
          })
        });

      if (response.ok) {
        const data = await response.json();
        groqIndex = (idx + 1) % pool.length;
        return data.choices[0].message.content.trim();
      }

      const errorData = await response.text();
      console.warn(`[Groq] Token ${idx} failed (${response.status}): ${errorData}`);
      await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
      console.error(`[Groq] Request failed: ${error.message}. Rotating...`);
    }
  }

  throw new Error('All Groq API tokens failed.');
}

async function testToken(token) {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: 'llama3-8b-8192', 
        messages: [{ role: 'user', content: 'hi' }], 
        max_tokens: 1 
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

module.exports = {
  generateChatResponse,
  jannatPersona,
  testToken
};
