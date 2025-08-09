import {
  saveReminder,
  removeReminder,
  getActiveReminders,
  clearAllReminders
} from '../db.js'; // Adjust path if needed

const reminders = {}; // Temporary memory for interval tracking only

function splitMessage(msg, maxLength = 4000) {
  const parts = [];
  while (msg.length > maxLength) {
    let sliceIndex = msg.lastIndexOf('\n', maxLength);
    if (sliceIndex === -1) sliceIndex = maxLength;
    parts.push(msg.slice(0, sliceIndex));
    msg = msg.slice(sliceIndex).trim();
  }
  if (msg.length) parts.push(msg);
  return parts;
}

export function registerReminderCommands(bot, isAdmin) {
  bot.onText(/^\/reminder\s+([\d.]+)\s*(--delete)?\s*([\s\S]*)?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(bot, chatId, msg.from.id))) {
      return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
    }

    const intervalRaw = parseFloat(match[1]);
    const shouldDelete = Boolean(match[2]);
    const customText = match[3]?.trim() || null;

    if (isNaN(intervalRaw) || intervalRaw < 0.08) {
      return bot.sendMessage(chatId, '⚠️ Reminder ka interval kam se kam 5 seconds hona chahiye.');
    }

    const repliedMsg = msg.reply_to_message;
    if (!repliedMsg) {
      return bot.sendMessage(chatId, '⚠️ Is command ko kisi message pe reply karke bhejna hota hai.');
    }

    const messageId = repliedMsg.message_id;
    const pollLink = `https://t.me/c/${String(chatId).slice(4)}/${messageId}`;
    const key = `${chatId}_${messageId}`;
    const intervalMs = intervalRaw * 60 * 1000;

    if (reminders[key]?.intervalId) clearInterval(reminders[key].intervalId);

    const REMINDER_TEXT = customText
      ? `${customText}\n\n👉 ${pollLink} 💙`
      : `📢 *Don't Miss Out!*\n🗳️ *Poll Chal Raha Hai!*\n\nJaldi vote karo! or check karo pin message!  \n👉 ${pollLink} 💙`;

    reminders[key] = {
      intervalId: null,
      lastMsgIds: [],
      shouldDelete
    };

    const intervalId = setInterval(async () => {
      try {
        const rem = reminders[key];
        if (!rem) return;

        if (rem.shouldDelete && rem.lastMsgIds.length) {
          for (const msgId of rem.lastMsgIds) {
            await bot.deleteMessage(chatId, msgId).catch(() => {});
          }
        }

        const chunks = splitMessage(REMINDER_TEXT);
        const newMsgIds = [];

        for (const chunk of chunks) {
          const sentMsg = await bot.sendMessage(chatId, chunk, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          });
          newMsgIds.push(sentMsg.message_id);
        }

        rem.lastMsgIds = newMsgIds;
      } catch (err) {
        console.error('❌ Reminder failed:', err.message);
      }
    }, intervalMs);

    reminders[key].intervalId = intervalId;

    saveReminder(chatId, messageId, intervalRaw, customText, shouldDelete);
    bot.sendMessage(chatId, `✅ Reminder started!\nEvery ${intervalRaw} min${shouldDelete ? ' (auto-delete ON)' : ''}.`);
  });

 bot.onText(/^\/stopreminder$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!(await isAdmin(bot, chatId, msg.from.id))) {
    return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
  }

  const repliedMsg = msg.reply_to_message;
  if (!repliedMsg) {
    return bot.sendMessage(chatId, '⚠️ Stop command ko reply karke bhejna hota hai.');
  }

  const messageId = repliedMsg.message_id;
  const activeReminders = getActiveReminders();

  // 🔹 Normalize for comparison
  const dbReminder = activeReminders.find(r => {
    const dbChatId = String(r.chat_id).replace(/\.0$/, ''); // remove ".0"
    const currentChatId = String(chatId);
    return dbChatId === currentChatId && Number(r.message_id) === Number(messageId);
  });

  if (!dbReminder) {
    return bot.sendMessage(chatId, '⚠️ Koi active reminder nahi mila is poll ke liye.');
  }

  const key = `${chatId}_${messageId}`;
  if (reminders[key]) {
    clearInterval(reminders[key].intervalId);
    delete reminders[key];
  }

  removeReminder(chatId, messageId);
  bot.sendMessage(chatId, '🛑 Reminder stopped.');
});


  bot.onText(/^\/listreminders$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(bot, chatId, msg.from.id))) {
      return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
    }

    const active = getActiveReminders();
    if (!active.length) {
      return bot.sendMessage(chatId, '😴 Abhi koi active reminder nahi hai.');
    }

    let text = '📋 *Active Reminders:*\n\n';
    for (const rem of active) {
      const pollLink = `https://t.me/c/${String(rem.chat_id).slice(4)}/${rem.message_id}`;
      text += `• [Poll Link](${pollLink}) — every ${rem.interval} min\n`;
    }

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  bot.onText(/^\/resetreminders$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!(await isAdmin(bot, chatId, msg.from.id))) {
      return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
    }

    Object.values(reminders).forEach(r => clearInterval(r.intervalId));
    for (const key in reminders) delete reminders[key];
    clearAllReminders();

    bot.sendMessage(chatId, '🧹 All reminders have been reset (memory + DB).');
  });
}

// Resume reminders on bot startup
export function resumeReminders(bot) {
  const rows = getActiveReminders();
  for (const row of rows) {
    const { chat_id, message_id, interval, custom_text, delete_prev_message } = row;
    const pollLink = `https://t.me/c/${String(chat_id).slice(4)}/${message_id}`;
    const key = `${chat_id}_${message_id}`;
    const REMINDER_TEXT = custom_text
      ? `${custom_text}\n\n👉 ${pollLink} 💙`
      : `
📢 *Don't Miss Out!*
🗳️ *Poll Chal Raha Hai!*

Jaldi vote karo! or check karo pin message!  
👉 ${pollLink} 💙
`.trim();

    reminders[key] = {
      intervalId: null,
      lastMsgIds: [],
      shouldDelete: delete_prev_message === 1
    };

    const intervalId = setInterval(async () => {
      try {
        const rem = reminders[key];
        if (!rem) return;

        if (rem.shouldDelete && rem.lastMsgIds.length) {
          for (const msgId of rem.lastMsgIds) {
            await bot.deleteMessage(chat_id, msgId).catch(() => {});
          }
        }

        const chunks = splitMessage(REMINDER_TEXT);
        const newMsgIds = [];

        for (const chunk of chunks) {
          const sentMsg = await bot.sendMessage(chat_id, chunk, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          });
          newMsgIds.push(sentMsg.message_id);
        }

        rem.lastMsgIds = newMsgIds;
      } catch (err) {
        console.error('⛔ Reminder failed:', err.message);
      }
    }, interval * 60 * 1000);

    reminders[key].intervalId = intervalId;
  }
}
