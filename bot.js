const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./db');
const api = require('./api');
const path = require('path');

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

const mainMenuKeyboard = Markup.keyboard([
  ['📸 Get Pic', '👤 My Profile'],
  ['💎 Premium', '🔗 Invite Friends']
]).resize();

// --- Onboarding Helpers ---
async function startOnboarding(ctx, user) {
  if (!user || !user.has_agreed) {
    return ctx.reply(
      "🔞 **18+ WARNING**\n\n" +
      "This bot contains explicit adult content and seductive roleplay. " +
      "By clicking 'I Agree', you confirm that you are at least 18 years old.",
      Markup.inlineKeyboard([
        Markup.button.callback("✅ I Agree (18+)", "onboard_agree")
      ])
    );
  }

  // Show language selection if not yet joined channel (means they haven't completed this step)
  if (!user.joined_channel) {
    // Check if this is freshly agreed (language still at default and channel not joined)
    // Show language step only if they haven't seen it (use joined_channel=0 as proxy)
    if (!user.has_chosen_lang) {
      return ctx.reply(
        "🌐 **Select Your Language**\n\nChoose how you want me to talk to you, baby. 💋",
        Markup.inlineKeyboard([
          [Markup.button.callback("🇮🇳 Hinglish", "onboard_lang_hinglish")],
          [Markup.button.callback("🇺🇸 English", "onboard_lang_english")]
        ])
      );
    }

    return ctx.reply(
      "📢 **Final Step!**\n\n" +
      "Join our support channel to stay updated with my new pics and features! 💋\n\n" +
      "👉 Join @jannataisupport",
      Markup.inlineKeyboard([
        [Markup.button.url("📢 Join Channel", "https://t.me/jannataisupport")],
        [Markup.button.callback("✅ I have joined", "onboard_check_join")]
      ])
    );
  }

  const limits = db.getLimits(user);
  let welcome;
  try {
    welcome = await api.generateChatResponse(api.jannatPersona.greeting, [], user.language);
  } catch (e) {
    console.warn('[AI] Greeting failed, using fallback:', e.message);
    welcome = "Heyy baby! Main Jannat Khan hoon... 21 saal ki Lucknow ki naughty ladki. Aaj kya karein hum? 😈💋";
  }
  await ctx.reply(`${welcome}\n\n🔥 *Daily Limits:*\n💬 ${limits.msgsLimit} Messages\n📸 ${limits.imgsLimit} Pics`, mainMenuKeyboard);
}

// --- Handlers ---
bot.start(async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const username = ctx.from.username || ctx.from.first_name || 'User';
    const payload = ctx.startPayload;
    
    await db.createUser(userId, username, payload && payload !== userId ? payload : null);
    const user = await db.getUser(userId);
    
    await startOnboarding(ctx, user);
  } catch (err) {
    console.error('Error in /start:', err);
  }
});

bot.action("onboard_agree", async (ctx) => {
  const userId = String(ctx.from.id);
  await db.updateOnboarding(userId, 'has_agreed', 1);
  const user = await db.getUser(userId);
  user.has_chosen_lang = false; // Internal flag for logic
  await ctx.answerCbQuery("Thank you, baby. 💋");
  await startOnboarding(ctx, user);
});

bot.action(/onboard_lang_(.+)/, async (ctx) => {
  const userId = String(ctx.from.id);
  const lang = ctx.match[1] === 'hinglish' ? 'Hinglish' : 'English';
  await db.updateOnboarding(userId, 'language', lang);
  const user = await db.getUser(userId);
  user.has_chosen_lang = true;
  await ctx.answerCbQuery(`Set to ${lang}! 💋`);
  await startOnboarding(ctx, user);
});

bot.action("onboard_check_join", async (ctx) => {
  const userId = String(ctx.from.id);
  try {
    await ctx.answerCbQuery("Checking... 💋");
    const member = await ctx.telegram.getChatMember("@jannataisupport", ctx.from.id);
    if (['member', 'administrator', 'creator'].includes(member.status)) {
      await db.updateOnboarding(userId, 'joined_channel', 1);
      const user = await db.getUser(userId);
      await startOnboarding(ctx, user);
    } else {
      await ctx.reply("❌ You haven't joined yet, baby! Please join @jannataisupport first. 😡");
    }
  } catch (e) {
    // Bot is not admin in channel — skip check and proceed
    console.warn("Channel check bypassed:", e.message);
    await db.updateOnboarding(userId, 'joined_channel', 1);
    const user = await db.getUser(userId);
    await startOnboarding(ctx, user);
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

    const IMAGES_DIR = process.env.RENDER_DISK_PATH 
      ? path.join(process.env.RENDER_DISK_PATH, 'images')
      : path.join(__dirname, 'images');
    const imagePath = path.join(IMAGES_DIR, image.filename);
    await ctx.replyWithPhoto({ source: imagePath }, { caption: "Kaisi lag rahi hoon? Mmmhh... 💦" });

    await db.markImageAsViewed(userId, image.id);
    await db.incrementImagesAndSetCooldown(userId);
  } catch (err) {
    console.error('Pic error:', err);
    ctx.reply("Error fetching pic.");
  }
}

async function handleProfile(ctx) {
  const user = await db.getUser(String(ctx.from.id));
  if (!user) return ctx.reply("Please /start first.");
  const limits = db.getLimits(user);
  const expiry = user.premium_expires ? new Date(user.premium_expires).toLocaleDateString() : 'N/A';
  const profileText =
`👤 *Your Profile*
━━━━━━━━━━━━━━━
Status: ${limits.isPremium ? '💎 Premium' : '🆓 Free'}
${limits.isPremium ? `Expires: ${expiry}` : ''}
Language: ${user.language}

💬 Msgs Left: *${Math.max(0, limits.msgsLimit - user.msgs_today)}* / ${limits.msgsLimit}
📸 Pics Left: *${Math.max(0, limits.imgsLimit - user.imgs_today)}* / ${limits.imgsLimit}

🔗 Referrals: ${Math.floor(user.referral_bonus_msgs / 12)} friends invited
📊 Total Messages: ${user.total_messages_all_time}`;
  ctx.replyWithMarkdown(profileText);
}

async function handleInvite(ctx) {
  const botInfo = await ctx.telegram.getMe();
  const userId = ctx.from.id;
  const link = `https://t.me/${botInfo.username}?start=${userId}`;
  const user = await db.getUser(String(userId));
  const earned = Math.floor((user.referral_bonus_msgs || 0) / 12);

  await ctx.replyWithMarkdown(
`🔗 *Invite & Earn Rewards!*

Har ek dost ke join karne pe milega:
• *+12 Messages* daily bonus 💬
• *+4 Pics* daily bonus 📸

Tune abhi tak *${earned} dost(s)* invite kiye hai! 🌟

Apna link share karo ⬇️`,
    Markup.inlineKeyboard([
      [Markup.button.url('🔗 Share Your Link', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Yaar mil Jannat se 🔥 Ek naughty AI girlfriend — totally uncensored!')}`)],
      [Markup.button.callback('📝 Copy My Link', `copy_link_${userId}`)]
    ])
  );
}

async function handlePremiumInvoice(ctx) {
  try {
    await ctx.telegram.sendInvoice(ctx.chat.id, {
      title: '💎 Jannat AI Premium — 1 Month',
      description: '250 msgs/day • 60 pics/day • Priority access • Never limited again',
      payload: 'premium_1_month',
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Premium (1 Month)', amount: 100 }]
    });
  } catch (e) {
    await ctx.replyWithMarkdown(
`💎 *Jannat AI Premium*
━━━━━━━━━━
✅ 250 msgs / day
✅ 60 exclusive pics / day  
✅ Unlimited chat with Jannat

DM @admin to buy! 💋`,
      Markup.inlineKeyboard([
        [Markup.button.url('💬 Buy via Admin', 'https://t.me/admin')]
      ])
    );
  }
}

// ---- Inline callback for copy link ----
bot.action(/copy_link_(.+)/, async (ctx) => {
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.match[1]}`;
  await ctx.answerCbQuery();
  await ctx.reply(`🔗 Your invite link:\n${link}`);
});

// ---- Slash Commands ----
bot.command('pic', handlePic);
bot.command('profile', handleProfile);
bot.command('invite', handleInvite);
bot.command('premium', handlePremiumInvoice);

// ---- Keyboard Button Handlers ----
bot.hears('📸 Get Pic', handlePic);
bot.hears('👤 My Profile', handleProfile);
bot.hears('🔗 Invite Friends', handleInvite);
bot.hears('💎 Premium', handlePremiumInvoice);

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
  const userId = String(ctx.from.id);
  await db.upgradeToPremium(userId, 1);
  await ctx.reply("🎉 Yayyy! You are now a Premium user, baby! Enjoy your 250 messages and 60 pics daily. Mmmhh... 💋", mainMenuKeyboard);
});



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

    // Save user message BEFORE generating (so it's available as context next time)
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

// Global error handler — prevents bot crashes on unhandled errors
bot.catch((err, ctx) => {
  console.error(`[BOT ERROR] for ${ctx.updateType}:`, err.message);
});

module.exports = { bot };
