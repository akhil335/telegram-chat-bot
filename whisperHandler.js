// whisperHandler.js (button-based public whisper with user lock)

import { askMainModel } from './mainModelHelper.js';

export async function handleWhisperCommand(bot, msg, userMessage, chatId) {
  const senderUsername = msg.from.username;
  const senderId = msg.from.id;

  // Step 1: Check if it's a whisper intent
  const intentCheck = await askMainModel([
    {
      role: 'user',
      content: `Did the user intend to whisper a message to someone? Message: "${userMessage}". Reply only with "yes" or "no".`
    }
  ]);

  if (!intentCheck.toLowerCase().startsWith('yes')) return false;

  // Step 2: Extract whisper username and message
  const whisperInfo = await askMainModel([
    {
      role: 'user',
      content: `Extract the target username and message from this:
"${userMessage}"

Reply only in JSON like:
{"username": "ritika123", "message": "you are cute"}`
    }
  ]);

  let parsed;
  try {
    parsed = JSON.parse(whisperInfo);
  } catch (err) {
    console.error("Whisper JSON parse error:", whisperInfo);
    return false;
  }

  const targetUsername = parsed.username;
  const whisperText = parsed.message;

  if (!targetUsername || !whisperText) return false;

  try {
    // Step 3: Delete original message
    await bot.deleteMessage(chatId, msg.message_id);

    // Step 4: Send button-based whisper in group
    await bot.sendMessage(chatId, `🔐 *Whisper for @${targetUsername}*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🔓 Open Whisper',
            callback_data: `whisper:@${targetUsername}:${whisperText}`.slice(0, 64) // Telegram has a 64 char limit
          }
        ]]
      }
    });

    // Optional: confirm to sender
    await bot.sendMessage(senderId, `Rem ne tumhara whisper lock karke @${targetUsername} ke liye bhej diya 💙`, {
      parse_mode: 'Markdown'
    });

    return true;
  } catch (err) {
    console.error("Whisper button error:", err);
    return false;
  }
}

// 🔄 Callback query handler (you should paste this into main.js too)
export async function handleWhisperButton(bot, query) {
  try {
    const data = query.data;
    if (!data.startsWith('whisper:')) return;

    const [_, rawUsername, ...msgParts] = data.split(':');
    const message = msgParts.join(':');

    const clicker = query.from?.username?.toLowerCase();
    const target = rawUsername.replace('@', '').toLowerCase();

    if (clicker !== target) {
      await bot.answerCallbackQuery(query.id, {
        text: '⛔ Sorry, this whisper is not for you.',
        show_alert: true
      });
      return;
    }

    await bot.answerCallbackQuery(query.id); // acknowledge
    await bot.sendMessage(query.message.chat.id, `💌 *Whisper for @${target}*: _${message}_`, {
      parse_mode: 'Markdown',
      reply_to_message_id: query.message.message_id
    });
  } catch (err) {
    console.error("Whisper button click error:", err);
  }
}
