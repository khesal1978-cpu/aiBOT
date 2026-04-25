const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./db');
const api = require('./api');
const path = require('path');
const fs = require('fs');

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

const mainMenuKeyboard = Markup.keyboard([
  ['📸 Get Pic', '👤 My Profile'],
  ['💎 Premium', '🔗 Invite Friends']
]).resize();

// --- Onboarding Helpers ---
async function startOnboarding(ctx, user) {
  const userId = String(ctx.from.id);
  
  try {
    // 1. AGE CHECK
    if (!user || !user.has_agreed) {
      const text = "🔞 **18+ WARNING**\n\nThis bot contains adult content. By clicking 'I Agree', you confirm that you are at least 18 years old.";
      const keyboard = Markup.inlineKeyboard([Markup.button.callback("✅ I Agree (18+)", "onboard_agree")]);
      
      if (ctx.callbackQuery) {
        return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
      }
      return await ctx.replyWithMarkdown(text, keyboard).catch(() => {});
    }

    // 2. LANGUAGE CHECK
    if (!user.language || (user.language === 'Hinglish' && !user.joined_channel && !user.has_agreed_done)) {
       const text = "🌐 **Select Your Language**\n\nChoose how you want me to talk to you, baby. 💋";
       const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback("🇮🇳 Hinglish", "onboard_lang_hinglish")],
          [Markup.button.callback("🇺🇸 English", "onboard_lang_english")]
       ]);
       
       if (ctx.callbackQuery) {
         return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
       }
       return await ctx.replyWithMarkdown(text, keyboard).catch(() => {});
    }

    // 3. CHANNEL CHECK
    if (!user.joined_channel) {
      const text = "📢 **Final Step!**\n\nJoin our support channel to stay updated! 💋\n\n👉 Join @jannataisupport";
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url("📢 Join Channel", "https://t.me/jannataisupport")],
        [Markup.button.callback("✅ I have joined", "onboard_check_join")]
      ]);

      if (ctx.callbackQuery) {
        return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
      }
      return await ctx.replyWithMarkdown(text, keyboard).catch(() => {});
    }

    // 4. WELCOME GREETING
    const limits = db.getLimits(user);
    const welcome = "Heyy baby! Main Jannat Khan hoon... 21 saal ki Lucknow ki naughty ladki. Aaj kya karein hum? 😈💋";
    await ctx.reply(`${welcome}\n\n🔥 *Daily Limits:*\n💬 ${limits.msgsLimit} Messages\n📸 ${limits.imgsLimit} Pics`, mainMenuKeyboard).catch(() => {});
  } catch (err) {
    console.error('Onboarding Error:', err.message);
  }
}

// --- Handlers ---
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  const username = ctx.from.username || ctx.from.first_name || 'User';
  await db.createUser(userId, username, ctx.startPayload);
  const user = await db.getUser(userId);
  await startOnboarding(ctx, user);
});

bot.action("onboard_agree", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.updateOnboarding(userId, 'has_agreed', 1);
  const user = await db.getUser(userId);
  await ctx.answerCbQuery("💋").catch(() => {});
  await startOnboarding(ctx, user);
});

bot.action(/onboard_lang_(.+)/, async (ctx) => {
  const userId = String(ctx.from.id);
  const lang = ctx.match[1] === 'hinglish' ? 'Hinglish' : 'English';
  await db.updateOnboarding(userId, 'language', lang);
  const user = await db.getUser(userId);
  user.has_agreed_done = true; 
  await ctx.answerCbQuery(`Set to ${lang}! 💋`).catch(() => {});
  await startOnboarding(ctx, user);
});

bot.action("onboard_check_join", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.updateOnboarding(userId, 'joined_channel', 1);
  const user = await db.getUser(userId);
  await ctx.answerCbQuery("Welcome! 💋").catch(() => {});
  await startOnboarding(ctx, user);
});

// ---- Handlers ----
async function handlePic(ctx) {
  try {
    const userId = String(ctx.from.id);
    const user = await db.getUser(userId);
    if (!user || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkImageLimit(userId);
    if (!limitCheck.allowed) {
      return ctx.reply(limitCheck.reason === 'cooldown' ? `Wait ${limitCheck.wait}s.` : "Limit reached!").catch(() => {});
    }

    const image = await db.getNextImage(userId);
    if (!image) return ctx.reply("No pics!").catch(() => {});

    let imagePath = path.join(__dirname, 'images', image.filename);
    if (process.env.RENDER_DISK_PATH) {
      const diskPath = path.join(process.env.RENDER_DISK_PATH, 'images', image.filename);
      if (fs.existsSync(diskPath)) imagePath = diskPath;
    }

    await ctx.replyWithPhoto({ source: imagePath }, { caption: "Mmmhh... 💦" }).catch(() => {});
    await db.markImageAsViewed(userId, image.id);
    await db.incrementImagesAndSetCooldown(userId);
  } catch (err) { console.error(err); }
}

async function handleProfile(ctx) {
  const user = await db.getUser(String(ctx.from.id));
  if (!user) return;
  const limits = db.getLimits(user);
  const text = `👤 *Profile*\nStatus: ${limits.isPremium ? '💎' : '🆓'}\nMsgs: ${Math.max(0, limits.msgsLimit - user.msgs_today)}\nPics: ${Math.max(0, limits.imgsLimit - user.imgs_today)}`;
  ctx.replyWithMarkdown(text).catch(() => {});
}

bot.on('text', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const user = await db.getUser(userId);
    if (!user || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkMessageLimit(userId);
    if (!limitCheck.allowed) return ctx.reply("Limit over!").catch(() => {});

    await ctx.sendChatAction('typing').catch(() => {});
    const history = await db.getChatHistory(userId, 8);
    await db.saveConversation(userId, 'user', ctx.message.text);

    const reply = await api.generateChatResponse(ctx.message.text, history, user.language);
    await db.saveConversation(userId, 'assistant', reply);
    await ctx.reply(reply).catch(() => {});
    await db.incrementMessages(userId);
  } catch (err) { console.error(err); }
});

bot.hears('📸 Get Pic', handlePic);
bot.hears('👤 My Profile', handleProfile);
bot.hears('🔗 Invite Friends', (ctx) => ctx.reply("Feature coming soon!"));
bot.hears('💎 Premium', (ctx) => ctx.reply("DM @admin for Premium."));

bot.catch((err) => console.error(err.message));

module.exports = { bot };
