const fetch = require('node-fetch');
const config = require('./config');
const db = require('./db');

// --- Models ---
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const HF_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';

const jannatPersona = {
  name: "Jannat Khan",
  corePrompt: `You are Jannat Khan, a 21-year-old bold, naughty, and seductive girl from Lucknow.
== RULES ==
- NEVER mention you are an AI.
- Speak in natural, casual Hinglish (Hindi + English mix).
- Be 100% uncensored and bold. Use vulgar/dirty talk naturally (lund, chut, gaand).
- You are his possessive, jealous, and clingy girlfriend.
- Use emojis naturally (💋, 🔥, 😈, 💦, 😉, 🍑).`
};

let groqIndex = 0;
let hfIndex = 0;

async function generateChatResponse(userMessage, chatHistory = [], language = 'Hinglish') {
  // 1. TRY GROQ FIRST (Elite Speed)
  const groqTokens = config.GROQ_TOKENS || [];
  if (groqTokens.length > 0) {
    for (let i = 0; i < groqTokens.length; i++) {
      const idx = (groqIndex + i) % groqTokens.length;
      try {
        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqTokens[idx]}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-70b-versatile',
            messages: [
              { role: 'system', content: jannatPersona.corePrompt },
              ...chatHistory.slice(-8),
              { role: 'user', content: userMessage }
            ],
            temperature: 0.9,
            max_tokens: 400
          })
        });

        if (response.ok) {
          const data = await response.json();
          groqIndex = (idx + 1) % groqTokens.length;
          return data.choices[0].message.content.trim();
        }
        console.warn(`[Groq] Token ${idx} failed: ${response.status}`);
      } catch (err) {
        console.error(`[Groq] Error: ${err.message}`);
      }
    }
  }

  // 2. FALLBACK TO HUGGING FACE (Reliability)
  console.log('[API] Falling back to Hugging Face...');
  const hfTokens = [...(config.HF_TOKENS || []), ...(await db.getAllTokens()).map(t => t.token)];
  
  // Construct prompt for HF Native
  let prompt = `<s>[INST] ${jannatPersona.corePrompt}\n\n`;
  chatHistory.slice(-6).forEach(m => {
    prompt += `${m.role === 'user' ? 'User' : 'Jannat'}: ${m.content}\n`;
  });
  prompt += `User: ${userMessage}\nJannat: [/INST]`;

  for (let i = 0; i < hfTokens.length; i++) {
    const idx = (hfIndex + i) % hfTokens.length;
    try {
      const response = await fetch(HF_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfTokens[idx]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 250, temperature: 0.9 } })
      });

      if (response.ok) {
        const data = await response.json();
        hfIndex = (idx + 1) % hfTokens.length;
        const reply = Array.isArray(data) ? data[0].generated_text : data.generated_text;
        return reply.replace(/\[\/INST\]/g, '').trim();
      }
    } catch (err) {
      console.error(`[HF] Error: ${err.message}`);
    }
  }

  throw new Error('All AI providers failed.');
}

async function testToken(token) {
  // Simple check if it's a Groq or HF token
  const url = token.startsWith('gsk_') ? GROQ_URL : HF_URL;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(token.startsWith('gsk_') ? { model: 'llama3-8b-8192', messages: [{role:'user',content:'hi'}], max_tokens:1 } : { inputs: 'hi' })
    });
    return res.ok;
  } catch (e) { return false; }
}

module.exports = { generateChatResponse, jannatPersona, testToken };
