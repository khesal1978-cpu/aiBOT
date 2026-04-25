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
  
  // 1. AGE CHECK
  if (!user || !user.has_agreed) {
    const text = "🔞 **18+ WARNING**\n\nThis bot contains explicit adult content and seductive roleplay. By clicking 'I Agree', you confirm that you are at least 18 years old.";
    const keyboard = Markup.inlineKeyboard([Markup.button.callback("✅ I Agree (18+)", "onboard_agree")]);
    
    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    return ctx.replyWithMarkdown(text, keyboard);
  }

  // 2. LANGUAGE CHECK
  if (!user.language || user.language === 'Hinglish' && !user.joined_channel && !user.has_agreed_done) {
     // Small hack: if they just agreed, show language
     const text = "🌐 **Select Your Language**\n\nChoose how you want me to talk to you, baby. 💋";
     const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🇮🇳 Hinglish", "onboard_lang_hinglish")],
        [Markup.button.callback("🇺🇸 English", "onboard_lang_english")]
     ]);
     
     if (ctx.callbackQuery) {
       return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
     }
     return ctx.replyWithMarkdown(text, keyboard);
  }

  // 3. CHANNEL CHECK
  if (!user.joined_channel) {
    const text = "📢 **Final Step!**\n\nJoin our support channel to stay updated with my new pics and features! 💋\n\n👉 Join @jannataisupport";
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/jannataisupport")],
      [Markup.button.callback("✅ I have joined", "onboard_check_join")]
    ]);

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    return ctx.replyWithMarkdown(text, keyboard);
  }

  // 4. WELCOME GREETING
  const limits = db.getLimits(user);
  let welcome;
  try {
    welcome = "Heyy baby! Main Jannat Khan hoon... 21 saal ki Lucknow ki naughty ladki. Aaj kya karein hum? 😈💋";
  } catch (e) {
    welcome = "Heyy baby! Jannat here. Ready for some fun? 💋";
  }
  await ctx.reply(`${welcome}\n\n🔥 *Daily Limits:*\n💬 ${limits.msgsLimit} Messages\n📸 ${limits.imgsLimit} Pics`, mainMenuKeyboard);
}

// --- Handlers ---
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  const username = ctx.from.username || ctx.from.first_name || 'User';
  const payload = ctx.startPayload;
  await db.createUser(userId, username, payload && payload !== userId ? payload : null);
  const user = await db.getUser(userId);
  await startOnboarding(ctx, user);
});

bot.action("onboard_agree", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.updateOnboarding(userId, 'has_agreed', 1);
  const user = await db.getUser(userId);
  await ctx.answerCbQuery("Perfect choice... 💋");
  await startOnboarding(ctx, user);
});

bot.action(/onboard_lang_(.+)/, async (ctx) => {
  const userId = String(ctx.from.id);
  const lang = ctx.match[1] === 'hinglish' ? 'Hinglish' : 'English';
  await db.updateOnboarding(userId, 'language', lang);
  // Mark that they finished lang selection
  await db.updateOnboarding(userId, 'is_banned', 0); // Using is_banned as a temp bit is bad, but we use joined_channel next
  const user = await db.getUser(userId);
  user.has_agreed_done = true; 
  await ctx.answerCbQuery(`Set to ${lang}! 💋`);
  await startOnboarding(ctx, user);
});

bot.action("onboard_check_join", async (ctx) => {
  const userId = String(ctx.from.id);
  try {
    await db.updateOnboarding(userId, 'joined_channel', 1);
    const user = await db.getUser(userId);
    await ctx.answerCbQuery("Welcome to the club! 💋");
    await startOnboarding(ctx, user);
  } catch (e) {
    await ctx.answerCbQuery("Error joining. 💋");
  }
});

// ---- Shared Handler Functions ----
async function handlePic(ctx) {
  try {
    const userId = String(ctx.from.id);
    const user = await db.getUser(userId);
    if (!user || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkImageLimit(userId);
    if (!limitCheck.allowed) {
      if (limitCheck.reason === 'cooldown') return ctx.reply(`Sabr karo jaan... wait ${limitCheck.wait}s. ⏳`);
      return ctx.reply("Daily limit over! Invite friends or get Premium for more. 💋");
    }

    const image = await db.getNextImage(userId);
    if (!image) return ctx.reply("No new pics right now, baby. 💋");

    // SMART IMAGE PATH SELECTION
    let imagePath = path.join(__dirname, 'images', image.filename);
    if (process.env.RENDER_DISK_PATH) {
      const diskPath = path.join(process.env.RENDER_DISK_PATH, 'images', image.filename);
      if (fs.existsSync(diskPath)) imagePath = diskPath;
    }

    await ctx.replyWithPhoto({ source: imagePath }, { caption: "Kaisi lag rahi hoon? Mmmhh... 💦" });

    await db.markImageAsViewed(userId, image.id);
    await db.incrementImagesAndSetCooldown(userId);
  } catch (err) {
    console.error('Pic error:', err);
    ctx.reply("Uff... pic load nahi ho rahi. Thoda wait karo baby. 💋");
  }
}

async function handleProfile(ctx) {
  const user = await db.getUser(String(ctx.from.id));
  if (!user) return ctx.reply("Please /start first.");
  const limits = db.getLimits(user);
  const expiry = user.premium_expires ? new Date(user.premium_expires).toLocaleDateString() : 'N/A';
  const profileText = `👤 *Your Profile*\n━━━━━━━━━━━━━━━\nStatus: ${limits.isPremium ? '💎 Premium' : '🆓 Free'}\nLanguage: ${user.language}\n\n💬 Msgs Left: *${Math.max(0, limits.msgsLimit - user.msgs_today)}*\n📸 Pics Left: *${Math.max(0, limits.imgsLimit - user.imgs_today)}*\n\n📊 Total Messages: ${user.total_messages_all_time}`;
  ctx.replyWithMarkdown(profileText);
}

async function handleInvite(ctx) {
  const botInfo = await ctx.telegram.getMe();
  const userId = ctx.from.id;
  const link = `https://t.me/${botInfo.username}?start=${userId}`;
  await ctx.replyWithMarkdown(`🔗 *Invite & Earn Rewards!*\n\nShare this link with your friends to get extra daily limits:\n\n\`${link}\``);
}

async function handlePremiumInvoice(ctx) {
  await ctx.replyWithMarkdown(`💎 *Jannat AI Premium*\n━━━━━━━━━━\n✅ 250 msgs / day\n✅ 60 exclusive pics / day\n\nDM @admin to buy! 💋`);
}

bot.command('pic', handlePic);
bot.command('profile', handleProfile);
bot.command('invite', handleInvite);
bot.command('premium', handlePremiumInvoice);

bot.hears('📸 Get Pic', handlePic);
bot.hears('👤 My Profile', handleProfile);
bot.hears('🔗 Invite Friends', handleInvite);
bot.hears('💎 Premium', handlePremiumInvoice);

bot.on('text', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const user = await db.getUser(userId);
    if (!user || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkMessageLimit(userId);
    if (!limitCheck.allowed) {
      if (limitCheck.reason === 'limit_reached') return ctx.reply("Ahhh... aaj ke liye itna hi! Upgrade to Premium or Invite friends to talk more. 💋");
      return;
    }

    await ctx.sendChatAction('typing');
    const history = await db.getChatHistory(userId, 10);
    await db.saveConversation(userId, 'user', ctx.message.text);

    const reply = await api.generateChatResponse(ctx.message.text, history, user.language);

    await db.saveConversation(userId, 'assistant', reply);
    await ctx.reply(reply);
    await db.incrementMessages(userId);
  } catch (err) {
    console.error('Chat error:', err.message);
    ctx.reply("Ufff baby... abhi mera dimag thoda busy hai, thodi der mein try karo. 💋");
  }
});

bot.catch((err, ctx) => {
  console.error(`[BOT ERROR] for ${ctx.updateType}:`, err.message);
});

module.exports = { bot };
