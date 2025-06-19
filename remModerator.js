// remModerator.js

const userWarnings = new Map();

const parseDuration = (text) => {
  const match = text.match(/(\d+)\s*(sec|min|hour|hr|h|m|s)/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit.includes('s')) return val;
  if (unit.includes('m')) return val * 60;
  if (unit.includes('h')) return val * 60 * 60;
  return 0;
};

const moderationActions = {
  warn: async (ctx, targetId, username) => {
    const key = `${ctx.chat.id}_${username}`;
    const count = (userWarnings.get(key) || 0) + 1;
    userWarnings.set(key, count);

    if (count >= 3) {
      userWarnings.set(key, 0);
      if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

      await ctx.bot.restrictChatMember(ctx.chat.id, targetId, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + 3600,
      });
      return `Ussne 3 baar galti ki... isliye maine use 1 ghante ke liye chup kara diya 😤`;
    }

    return `Rem ne warning de di ${username} ko ⚠️ (Warning ${count}/3)`;
  },

  mute: async (ctx, targetId, username, duration) => {

    const seconds = parseDuration(duration);
    
    if (!seconds) return `Hmm mujhe time samajh nahi aaya 🥺`;
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

    await ctx.bot.restrictChatMember(ctx.chat.id, targetId, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + seconds,
    });
    return `Thik hai~ ${username} ab ${duration} ke liye chup ho gaya 🙊`;
  },

  unmute: async (ctx, targetId, username) => {
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

   await ctx.bot.promoteChatMember(ctx.chat.id, targetId, {
      can_send_messages: true,
    });
    return `Okayy~ ${username} ab bol sakta hai phir se 💬`;
  },

  ban: async (ctx, targetId, username) => {
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;
    await ctx.bot.banChatMember(ctx.chat.id, targetId);
    return `Maine use hamesha ke liye bhej diya bahar 😠👋`;
  },

  unban: async (ctx, targetId, username) => {
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;
    await ctx.bot.unbanChatMember(ctx.chat.id, targetId);
    return `${username} wapas aa sakta hai ab 😊`;
  }
};

export async function handleModerationCommand(text, userIdMap, bot, chat, msg) {
  if (!chat.type.includes('group')) {
    return 'Yeh command sirf group chats mein kaam karti hai 🥺';
  }

  const ctx = { bot, chat, userIdMap };
  const lower = text.toLowerCase();

  const replyUserId = msg.reply_to_message?.from?.id;
  const replyUsername = msg.reply_to_message?.from?.username?.toLowerCase();
  const name = (msg.reply_to_message?.from?.first_name || '') + ' ' + (msg.reply_to_message?.from?.last_name || '')
  const userName = replyUsername ? replyUsername : name
  

  if (!replyUserId) {
    return `Mujhe pata nahi chala kispe command lagani hai 😅 Please kisi ko reply karke command do`;
  }

  if (userIdMap[replyUsername]) {
    return `Nahi~ mai ye nahi kar sakti 😇`;
  }

  if (lower.includes('warn')) {
    return await moderationActions.warn(ctx, replyUserId, userName);
  }

  const muteMatch = lower.match(/for\s+(\d+)\s*(sec|min|hour|hr|h|m|s)/);
  if (lower.includes('mute') && muteMatch) {
    
    const dur = `${muteMatch[1]} ${muteMatch[2]}`;

    return await moderationActions.mute(ctx, replyUserId, userName, dur);
  }

  if (lower.includes('unmute')) {
    return await moderationActions.unmute(ctx, replyUserId, userName);
  }

  if (lower.includes('ban')) {
    return await moderationActions.ban(ctx, replyUserId, userName);
  }

  if (lower.includes('unban')) {
    return await moderationActions.unban(ctx, replyUserId, userName);
  }

  return null;
}

export { userWarnings };
