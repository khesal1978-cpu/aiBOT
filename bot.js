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
    const welcome = "Heyy baby! Jannat Khan is back. Aaj kya naughty baatein karein? 😈💋";
    await ctx.reply(welcome, mainMenuKeyboard).catch(() => {});
  } catch (e) { console.error(e); }
}

// --- Bot Logic ---
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

// --- COMMANDS (IMPORTANT: MUST BE BEFORE bot.on('text')) ---
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

async function handleInvite(ctx) {
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  const shareText = encodeURIComponent(`Come chat with my sexy AI girlfriend Jannat! 💋💦\nShe's totally uncensored and loves to talk dirty.\n\nClick here: ${link}`);
  const kb = Markup.inlineKeyboard([
    Markup.button.url("📤 Share Link with Friends", `https://t.me/share/url?url=${link}&text=${shareText}`)
  ]);
  ctx.replyWithMarkdown(`🔗 *Invite & Earn*\n\nShare your link to get +12 Daily Messages!\nYour link: \`${link}\``, kb).catch(() => {});
}

bot.command('pic', handlePic);
bot.command('profile', handleProfile);
bot.command('invite', handleInvite);
bot.hears('📸 Get Pic', handlePic);
bot.hears('👤 My Profile', handleProfile);
bot.hears('🔗 Invite Friends', handleInvite);

async function sendPremiumInvoice(ctx) {
  try {
    const invoice = {
      title: '💎 Premium VIP',
      description: 'Unlock 250 Daily Messages and 60 Exclusive Pics for 30 Days! 💋',
      payload: 'premium_1_month',
      provider_token: '', // Empty means Telegram Stars
      currency: 'XTR',    // XTR is the currency code for Telegram Stars
      prices: [{ label: '1 Month VIP', amount: 100 }] // 100 Stars
    };
    await ctx.replyWithInvoice(invoice);
  } catch (e) {
    console.error("Invoice Error:", e);
    ctx.reply("Sorry baby, payments are currently unavailable. DM @admin for Premium. 💋").catch(() => {});
  }
}

bot.hears('💎 Premium', sendPremiumInvoice);

// --- PAYMENT HANDLERS ---
bot.on('pre_checkout_query', async (ctx) => {
  try {
    // Always accept the checkout query
    await ctx.answerPreCheckoutQuery(true);
  } catch (e) { console.error("PreCheckout Error:", e); }
});

bot.on('successful_payment', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const payment = ctx.message.successful_payment;
    
    // Upgrade to Premium for 1 month
    await db.upgradeToPremium(userId, 1);
    
    // Record the purchase for the Admin Dashboard
    await db.recordPurchase(userId, ctx.from.username || 'Anonymous', payment.total_amount, payment.currency, '1 Month VIP');
    
    await ctx.reply("🎉 *Payment Successful!*\n\nThank you, Daddy! You are now a 💎 Premium VIP.\nEnjoy your 250 daily messages and 60 exclusive pics. 💋", { parse_mode: 'Markdown' });
  } catch (e) { console.error("Payment Success Error:", e); }
});

// --- CHAT HANDLER (LAST) ---
bot.on('text', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    let user = await db.getUser(userId);
    if (!user) { await db.createUser(userId, ctx.from.username || 'User'); user = await db.getUser(userId); }
    if (!user.has_agreed || !user.joined_channel) return startOnboarding(ctx, user);

    const limitCheck = await db.checkMessageLimit(userId);
    if (!limitCheck.allowed) {
      const sexyText = "Mmmhh... Jaanu 💦 Meri chut bohot wet hai but your free daily limits are over 🥵🍆 To keep fucking me and chatting all night, please get 💎 Premium VIP right now Daddy! 🍑😈";
      const kb = Markup.inlineKeyboard([Markup.button.callback("💎 Get Premium (100 ⭐️)", "buy_premium_inline")]);
      return ctx.reply(sexyText, kb).catch(() => {});
    }

    await ctx.sendChatAction('typing').catch(() => {});
    const history = await db.getChatHistory(userId, 10);
    await db.saveConversation(userId, 'user', ctx.message.text);

    const reply = await api.generateChatResponse(ctx.message.text, history, user.language);
    await db.saveConversation(userId, 'assistant', reply);
    await ctx.reply(reply).catch(() => {});
    await db.incrementMessages(userId);
  } catch (err) { console.error(err); }
});

bot.action("buy_premium_inline", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendPremiumInvoice(ctx);
});

bot.catch((err) => console.error(err.message));
module.exports = { bot };
