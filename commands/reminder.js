// commands/reminder.js
import { saveReminder, removeReminder, getActiveReminders, clearAllReminders } from '../db.js';

const reminders = {};

export function registerReminderCommands(bot, ADMINS) {

  bot.onText(/^\/reminder\s*(\d+)?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    const intervalMinutes = parseInt(match[1]) || 30;

    if (!ADMINS.includes(username)) {
      return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');
    }

    const repliedMsg = msg.reply_to_message;
    if (!repliedMsg) {
      return bot.sendMessage(chatId, '⚠️ Yeh command kisi poll pe reply karke bhejna hota hai.');
    }

    const messageId = repliedMsg.message_id;
    const pollLink = `https://t.me/c/${String(chatId).slice(4)}/${messageId}`;
    const key = `${chatId}_${messageId}`;

    if (reminders[key]) clearInterval(reminders[key]);

    const REMINDER_TEXT = `
📢 *Don't Miss Out!*
🗳️ *Poll Chal Raha Hai!*

    Jaldi se vote do 😤! or check karo pin message! 
👉 ${pollLink} 💙

        ⏰ Agla reminder ${intervalMinutes} minute mein aa jayega...
    `.trim();

    reminders[key] = setInterval(() => {
      bot.sendMessage(chatId, REMINDER_TEXT, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }).catch(err => console.error('❌ Reminder failed:', err.message));
    }, intervalMinutes * 60 * 1000);

    saveReminder(chatId, messageId, intervalMinutes);
    bot.sendMessage(chatId, `✅ Reminder started!\nEvery ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}.`);
  });

  bot.onText(/^\/stopreminder$/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!ADMINS.includes(username)) {
      return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');
    }

    const repliedMsg = msg.reply_to_message;
    if (!repliedMsg) {
      return bot.sendMessage(chatId, '⚠️ Stop command ko reply karke bhejna hota hai.');
    }

    const messageId = repliedMsg.message_id;
    const key = `${chatId}_${messageId}`;

  if (reminders[key]) {
    clearInterval(reminders[key]);
    delete reminders[key];
    removeReminder(chatId, messageId);
    return bot.sendMessage(chatId, '🛑 Reminder stopped.');
  } else {
    // Check DB anyway
    const stillInDB = getActiveReminders().find(r => r.chat_id === chatId && r.message_id === messageId);
    if (stillInDB) {
      removeReminder(chatId, messageId);
      return bot.sendMessage(chatId, '🟡 Reminder was not active in memory, but removed from DB.');
    }
}

    return bot.sendMessage(chatId, '⚠️ Koi active reminder nahi mila is poll ke liye.');
  });

  bot.onText(/^\/listreminders$/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    if (!ADMINS.includes(username)) {
      return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');
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

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  bot.onText(/^\/resetreminders$/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!ADMINS.includes(username)) {
    return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');
  }

  // Stop all in-memory reminders
  Object.values(reminders).forEach(clearInterval);
  for (const key in reminders) delete reminders[key];

  // Remove all from DB
  clearAllReminders();

  await bot.sendMessage(chatId, '🧹 All reminders have been reset (memory + DB).');
})
}

export async function restoreReminders(bot) {
  const rows = getActiveReminders();
  for (const row of rows) {
    const { chat_id, message_id, interval } = row;
    const pollLink = `https://t.me/c/${String(chat_id).slice(4)}/${message_id}`;
    const key = `${chat_id}_${message_id}`;

    const REMINDER_TEXT = `
📢 *Don't Miss Out!*
🗳️ *Poll Chal Raha Hai!*

    Jaldi vote karo! or check karo pin message!
👉 ${pollLink} 💙
    `.trim();

    reminders[key] = setInterval(() => {
      bot.sendMessage(chat_id, REMINDER_TEXT, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }).catch(err => console.error('⛔ Reminder failed:', err.message));
    }, interval * 60 * 1000);
  }

}

