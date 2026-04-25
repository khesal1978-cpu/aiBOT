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

// Remove the extra blue "Menu" button completely
bot.telegram.deleteMyCommands();

// --- Onboarding ---
async function startOnboarding(ctx, user) {
  try {
    if (!user.has_agreed) {
      const text = "🔞 **18+ WARNING**\n\nJannat is an adult AI. You must be 18+ to talk to her. Do you agree?";
      const kb = Markup.inlineKeyboard([Markup.button.callback("✅ I Agree", "onboard_agree")]);
      if (ctx.callbackQuery) return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
      return await ctx.replyWithMarkdown(text, kb).catch(() => {});
    }
    if (!user.joined_channel) {
      const text = "📢 **JOIN SUPPORT**\n\nJoin @jannataisupport to unlock my full chat and pics! 💋";
      const kb = Markup.inlineKeyboard([
        [Markup.button.url("📢 Join Channel", "https://t.me/jannataisupport")],
        [Markup.button.callback("✅ Joined!", "onboard_check_join")]
      ]);
      if (ctx.callbackQuery) return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
      return await ctx.replyWithMarkdown(text, kb).catch(() => {});
    }
    const welcome = "Heyy baby! Jannat Khan is here. Aaj kya naughty baatein karein? 😈💋";
    await ctx.reply(welcome, mainMenuKeyboard).catch(() => {});
  } catch (e) { console.error(e); }
}

// --- Handlers ---
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  await db.createUser(userId, ctx.from.username || 'User', ctx.startPayload);
  const user = await db.getUser(userId);
  await startOnboarding(ctx, user);
});

bot.action("onboard_agree", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.createUser(userId, ctx.from.username || 'User');
  await db.updateOnboarding(userId, 'has_agreed', 1);
  const user = await db.getUser(userId);
  await ctx.answerCbQuery("💋").catch(() => {});
  await startOnboarding(ctx, user);
});

bot.action("onboard_check_join", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.updateOnboarding(userId, 'joined_channel', 1);
  const user = await db.getUser(userId);
  await ctx.answerCbQuery("Welcome! 💋").catch(() => {});
  await startOnboarding(ctx, user);
});

// --- COMMANDS ---
async function handlePic(ctx) {
  try {
    const userId = String(ctx.from.id);
    const user = await db.getUser(userId);
    if (!user || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkImageLimit(userId);
    if (!limitCheck.allowed) return ctx.reply(limitCheck.reason === 'cooldown' ? `Wait ${limitCheck.wait}s.` : "Daily limit over!").catch(() => {});

    const image = await db.getNextImage(userId);
    if (!image) return ctx.reply("No pics left today!").catch(() => {});

    let imagePath = path.join(__dirname, 'images', image.filename);
    if (process.env.RENDER_DISK_PATH) {
      const dp = path.join(process.env.RENDER_DISK_PATH, 'images', image.filename);
      if (fs.existsSync(dp)) imagePath = dp;
    }
    await ctx.replyWithPhoto({ source: imagePath }, { caption: "Kaisi lag rahi hoon? 💦" }).catch(() => {});
    await db.markImageAsViewed(userId, image.id);
    await db.incrementImagesAndSetCooldown(userId);
  } catch (e) { console.error(e); }
}

async function handleProfile(ctx) {
  const user = await db.getUser(String(ctx.from.id));
  if (!user) return;
  const limits = db.getLimits(user);
  const text = `👤 *Your Profile*\n\nStatus: ${limits.isPremium ? '💎 Premium' : '🆓 Free'}\n💬 Msgs Left: ${Math.max(0, limits.msgsLimit - user.msgs_today)}\n📸 Pics Left: ${Math.max(0, limits.imgsLimit - user.imgs_today)}\n📊 Total Chats: ${user.total_messages_all_time}`;
  ctx.replyWithMarkdown(text).catch(() => {});
}

bot.command('pic', handlePic);
bot.command('profile', handleProfile);
bot.hears('📸 Get Pic', handlePic);
bot.hears('👤 My Profile', handleProfile);
bot.hears('🔗 Invite Friends', (ctx) => ctx.replyWithMarkdown("🔗 *Invite & Earn*\n\nShare link to get bonus limits."));
bot.hears('💎 Premium', (ctx) => ctx.replyWithMarkdown("💎 *Premium Mode*\n\n250 Msgs & 60 Pics Daily.\n\nDM @admin to buy! 💋"));

// --- CHAT HANDLER ---
bot.on('text', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    let user = await db.getUser(userId);
    if (!user) { await db.createUser(userId, ctx.from.username || 'User'); user = await db.getUser(userId); }
    if (!user.has_agreed || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkMessageLimit(userId);
    if (!limitCheck.allowed) return ctx.reply("Limit over for today! 💋").catch(() => {});

    await ctx.sendChatAction('typing').catch(() => {});
    const history = await db.getChatHistory(userId, 8);
    await db.saveConversation(userId, 'user', ctx.message.text);

    const reply = await api.generateChatResponse(ctx.message.text, history, user.language);
    await db.saveConversation(userId, 'assistant', reply);
    await ctx.reply(reply).catch(() => {});
    await db.incrementMessages(userId);
  } catch (err) { console.error(err); }
});

bot.catch((err) => console.error(err.message));
module.exports = { bot };
