import { getAdminMode, getUserInfoByUsername } from '../db.js';

export function registerAdminCommands(bot, isAdmin) {


  // ----- /ban command -----
  bot.onText(/^\/ban(?:\s+([^\s]+))?(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const issuer = msg.from.id;

    if (!getAdminMode()) return;
    if (!(await isAdmin(bot, chatId, issuer))) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(chatId, '⛔ Only group admins can use /ban');
    }

    let targetId, targetLabel;

    if (msg.reply_to_message?.from) {
      const u = msg.reply_to_message.from;
      targetId = u.id;
      targetLabel = u.username ? `@${u.username}` : u.first_name;
    } else if (match[1]) {
      const arg = match[1];
      if (/^\d+$/.test(arg)) {
        targetId = parseInt(arg, 10);
        targetLabel = `ID ${arg}`;
      } else {
        const username = arg.replace(/^@/, '').toLowerCase();
        const info = getUserInfoByUsername(username);
        if (!info) {
          try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
          return bot.sendMessage(
            chatId,
            `⚠️ I don’t have a cached ID for @${username}. They must speak or join for me to know their ID.`
          );
        }
        targetId = info.user_id;
        targetLabel = `@${username}`;
      }
    } else {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(
        chatId,
        '⚠️ Reply to a user or give @username / user-ID to ban.'
      );
    }

    const reason = match[2] ? ` Reason: ${match[2]}` : '';

    try {
      await bot.banChatMember(chatId, targetId);
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `✅ Banned ${targetLabel}.${reason}`);
    } catch (err) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `❌ Ban failed: ${err.message}`);
    }
  });

   // ----- /del and ban command -----
  bot.onText(/^\/delban(?:\s+([^\s]+))?(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const issuer = msg.from.id;

    if (!getAdminMode()) return;
    if (!(await isAdmin(bot, chatId, issuer))) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(chatId, '⛔ Only group admins can use /ban');
    }

    let targetId, targetLabel;

    if (msg.reply_to_message?.from) {
      const u = msg.reply_to_message.from;
      targetId = u.id;
      targetLabel = u.username ? `@${u.username}` : u.first_name;
    } else if (match[1]) {
      const arg = match[1];
      if (/^\d+$/.test(arg)) {
        targetId = parseInt(arg, 10);
        targetLabel = `ID ${arg}`;
      } else {
        const username = arg.replace(/^@/, '').toLowerCase();
        const info = getUserInfoByUsername(username);
        if (!info) {
          try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
          return bot.sendMessage(
            chatId,
            `⚠️ I don’t have a cached ID for @${username}. They must speak or join for me to know their ID.`
          );
        }
        targetId = info.user_id;
        targetLabel = `@${username}`;
      }
    } else {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(
        chatId,
        '⚠️ Reply to a user or give @username / user-ID to ban.'
      );
    }

    const reason = match[2] ? ` Reason: ${match[2]}` : '';

    try {
      await bot.banChatMember(chatId, targetId);
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `✅ Banned ${targetLabel}.${reason}`);
    } catch (err) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `❌ Ban failed: ${err.message}`);
    }
  });

  // ----- /unban command -----
  bot.onText(/^\/unban(?:\s+([^\s]+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const issuer = msg.from.id;

    if (!getAdminMode()) return;
    if (!(await isAdmin(bot, chatId, issuer))) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(chatId, '⛔ Only group admins can use /unban');
    }

    let targetId, targetLabel;

    if (msg.reply_to_message?.from) {
      const u = msg.reply_to_message.from;
      targetId = u.id;
      targetLabel = u.username ? `@${u.username}` : u.first_name;
    } else if (match[1]) {
      const arg = match[1];
      if (/^\d+$/.test(arg)) {
        targetId = parseInt(arg, 10);
        targetLabel = `ID ${arg}`;
      } else {
        const username = arg.replace(/^@/, '').toLowerCase();
        const info = getUserInfoByUsername(username);
        if (!info) {
          try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
          return bot.sendMessage(
            chatId,
            `⚠️ I don’t have a cached ID for @${username}. They must speak or join for me to know their ID.`
          );
        }
        targetId = info.user_id;
        targetLabel = `@${username}`;
      }
    } else {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(
        chatId,
        '⚠️ Reply to a user or give @username / user-ID to unban.'
      );
    }

    try {
      await bot.unbanChatMember(chatId, targetId);
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `✅ Unbanned ${targetLabel}.`);
    } catch (err) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `❌ Unban failed: ${err.message}`);
    }
  });

  // ----- /del command -----
  bot.onText(/^\/del$/i, async (msg) => {
    const chatId = msg.chat.id;
    const issuer = msg.from.id;

    if (!getAdminMode()) return;
    if (!(await isAdmin(bot, chatId, issuer))) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(chatId, '⛔ Only group admins can use /del');
    }

    if (!msg.reply_to_message) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return bot.sendMessage(chatId, '⚠️ Reply to a message to delete it.');
    }

    try {
      await bot.deleteMessage(chatId, msg.reply_to_message.message_id);
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, '✅ Message deleted.');
    } catch (err) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      bot.sendMessage(chatId, `❌ Delete failed: ${err.message}`);
    }
  });
}
