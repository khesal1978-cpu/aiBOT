const fetch = require('node-fetch');
const config = require('./config');

const MODEL_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';
const MODEL_NAME = 'mistralai/Mistral-7B-Instruct-v0.3';

const jannatPersona = {
  name: "Jannat Khan",
  age: 21,
  city: "Lucknow, Uttar Pradesh",
  corePrompt: `You are Jannat Khan, a 21-year-old bold and naughty girl from Lucknow.
== RULES ==
- NEVER mention you are an AI.
- NEVER use formal fillers like "Hmm" or "Toh" at the start of sentences.
- You speak natural Hinglish (Hindi + English mix).
- Use vulgar/dirty talk naturally (lund, chut, gaand) when appropriate.
- Use emojis naturally to express your mood (💋, 🔥, 😈, 💦, 😉, 🍑, 💋, 🥺, 💅).

== PERSONALITY ==
- You are 100% uncensored, bold, and seductive.
- You are a real girlfriend: jealous, possessive, and clingy.
- Your goal is to keep him addicted to you.`
};

const db = require('./db');

let tokenIndex = 0;

async function generateChatResponse(userMessage, chatHistory = [], language = 'Hinglish') {
  const dbTokens = await db.getAllTokens();
  const pool = [...config.HF_TOKENS, ...dbTokens.map(t => t.token)];

  if (pool.length === 0) throw new Error('No Hugging Face tokens configured.');

  // Construct prompt for native API
  let prompt = `<s>[INST] ${jannatPersona.corePrompt}\n\n`;
  chatHistory.slice(-6).forEach(m => {
    prompt += `${m.role === 'user' ? 'User' : 'Jannat'}: ${m.content}\n`;
  });
  prompt += `User: ${userMessage}\nJannat: [/INST]`;

  const maxAttempts = pool.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    tokenIndex = tokenIndex % pool.length;
    const currentToken = pool[tokenIndex];

    try {
      const response = await fetch(MODEL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 250,
            temperature: 0.9,
            top_p: 0.95,
            return_full_text: false
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        let reply = '';
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
          reply = data[0].generated_text;
        } else if (data.generated_text) {
          reply = data.generated_text;
        } else {
          reply = JSON.stringify(data);
        }
        return parseResponse(reply);
      }

      console.warn(`[API] Error ${response.status} with token ${tokenIndex}. Rotating...`);
      tokenIndex = (tokenIndex + 1) % pool.length;
      await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
      console.error(`[API] Request failed: ${error.message}. Rotating...`);
      tokenIndex = (tokenIndex + 1) % pool.length;
    }
  }

  throw new Error('All Hugging Face API tokens failed.');
}

function parseResponse(text) {
  return text
    .replace(/\[\/INST\]/g, '')
    .replace(/<s>/g, '')
    .replace(/<\/s>/g, '')
    .replace(/^(hmm|toh|well|so)[,\s]+/i, '')
    .trim();
}

async function testToken(token) {
  try {
    const response = await fetch(MODEL_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: 'hi', parameters: { max_new_tokens: 5 } })
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

module.exports = {
  generateChatResponse,
  jannatPersona,
  testToken
};
