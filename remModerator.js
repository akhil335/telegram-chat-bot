// remModerator.js

const userWarnings = new Map();

const parseDuration = (text) => {
  const match = text?.match(/(\d+)\s*(sec|min|hour|hr|h|m|s)/);
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

      try {
        await ctx.bot.restrictChatMember(ctx.chat.id, targetId, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(Date.now() / 1000) + 3600,
        });
        return `Ussne 3 baar galti ki... isliye maine use 1 ghante ke liye chup kara diya 😤`;
      } catch (err) {
        console.error('Restrict error (warn):', err);
        return `Kuch problem aayi use mute karne mein 😖`;
      }
    }

    return `Rem ne warning de di ${username} ko ⚠️ (Warning ${count}/3)`;
  },

  mute: async (ctx, targetId, username, duration) => {
    const seconds = parseDuration(duration) || 2 * 60 * 60; // default: 2 hours

    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

    try {
      await ctx.bot.restrictChatMember(ctx.chat.id, targetId, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + seconds,
      });
      return `Thik hai~ ${username} ab ${duration || '2 hour'} ke liye chup ho gaya 🙊`;
    } catch (err) {
      console.error('Mute error:', err);
      return `Mute karne mein kuch dikkat ho gayi 😣`;
    }
  },

  unmute: async (ctx, targetId, username) => {
  if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

  try {
    const member = await ctx.bot.getChatMember(ctx.chat.id, targetId);
    const perms = member?.can_send_messages;

    if (perms === true) {
      return `${username} pehle se hi bol sakta hai 😅`;
    }

    await ctx.bot.restrictChatMember(ctx.chat.id, targetId, {
        can_send_messages: true,
      });

  
    return `Okayy~ ${username} ab bol sakta hai phir se 💬`;
  } catch (err) {
    console.error('Unmute error:', err.response?.description || err);
    return `Unmute karne mein dikkat ho gayi 😥`;
  }
  }
,

  ban: async (ctx, targetId, username) => {
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

    try {
      await ctx.bot.banChatMember(ctx.chat.id, targetId);
      return `Maine use hamesha ke liye bhej diya bahar 😠👋`;
    } catch (err) {
      console.error('Ban error:', err);
      return `Ban karne mein dikkat ho gayi 😤`;
    }
  },

  unban: async (ctx, targetId, username) => {
    if (!targetId) return `Mujhe ${username} ka ID nahi mila 😔`;

    try {
      await ctx.bot.unbanChatMember(ctx.chat.id, targetId);
      return `${username} wapas aa sakta hai ab 😊`;
    } catch (err) {
      console.error('Unban error:', err);
      return `Unban nahi ho paaya 😓`;
    }
  },
};

export async function handleModerationCommand(text, userIdMap, bot, chat, msg) {
  if (!chat.type.includes('group')) {
    return 'Yeh command sirf group chats mein kaam karti hai 🥺';
  }

  const ctx = { bot, chat, userIdMap };
  const lower = text.toLowerCase();

  if (!msg.reply_to_message?.from) {
    return `Kispe command lagani hai woh clear nahi hai 😅`;
  }

  const replyUser = msg.reply_to_message.from;
  const replyUserId = replyUser.id;
  const replyUsername = replyUser.username?.toLowerCase();
  const fullName = [replyUser.first_name, replyUser.last_name].filter(Boolean).join(' ');
  const userName = replyUsername || fullName || 'unknown user';

  if (!replyUserId) {
    return `Mujhe pata nahi chala kispe command lagani hai 😅 Please kisi ko reply karke command do`;
  }

  if (replyUsername && userIdMap[replyUsername]) {
    return `Nahi~ mai ye nahi kar sakti 😇`;
  }

  if (lower.includes('warn')) {
    return await moderationActions.warn(ctx, replyUserId, userName);
  }

  const muteMatch = lower.match(/for\s+(\d+)\s*(sec|min|hour|hr|h|m|s)/);

  if (lower.includes('unmute')) {
    return await moderationActions.unmute(ctx, replyUserId, userName);
  }

  if (lower.includes('unban')) {
    return await moderationActions.unban(ctx, replyUserId, userName);
  }


  if (lower.includes('mute')) {
    const dur = muteMatch ? `${muteMatch[1]} ${muteMatch[2]}` : null;
    return await moderationActions.mute(ctx, replyUserId, userName, dur);
  }

  if (lower.includes('ban')) {
    return await moderationActions.ban(ctx, replyUserId, userName);
  }

  return null;
}

export { userWarnings };
