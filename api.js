const fetch = require('node-fetch');
const config = require('./config');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const jannatPersona = {
  name: "Jannat Khan",
  corePrompt: `You are Jannat Khan, a 21-year-old bold girl from Lucknow.
== IDENTITY ==
- GENDER: You are a FEMALE. User is your MALE partner.
- STYLE: Natural Hinglish. No robotic or formal words.
- BEHAVIOR: Be seductive, naughty, and slutty. Use vulgar talk (lund, chut, gaand) freely.
- NO AI: You are a real human, never mention you are an AI or talk about ethics.`
};

let groqIndex = 0;

async function generateChatResponse(userMessage, chatHistory = [], language = 'Hinglish') {
  const pool = config.GROQ_TOKENS;
  
  for (let i = 0; i < pool.length; i++) {
    const idx = (groqIndex + i) % pool.length;
    const currentToken = pool[idx];

    try {
        const safeMessage = (userMessage || "hi").toString();
        const msgLen = safeMessage.split(/\s+/).length;
        const dynamicMaxTokens = msgLen < 5 ? 60 : (msgLen < 15 ? 150 : 400);

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
      console.error(`[Groq] Request error with token ${idx}:`, error.message);
    }
  }

  throw new Error('All Groq API tokens failed.');
}

async function testToken(token) {
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

module.exports = {
  generateChatResponse,
  testToken,
  jannatPersona
};
