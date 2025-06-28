import { askLLM } from './mini_grok_bot.js';
import { getUserInfoByUsername } from './db.js';

export async function handleWhisperCommand(bot, msg, userMessage, chatId) {
  const senderUsername = msg.from.username;
  const senderId = msg.from.id;

  // ⚡️ Step 0: Fast local check to skip obvious non-whispers
  const maybeWhisper = /@[\w\d_]+/.test(userMessage) &&
    /(whisper|secret|chup|sirf|dm|private|batana)/i.test(userMessage);
  if (!maybeWhisper) return false;

  // Step 1: Confirm with LLM
  const intentCheck = await askLLM([
    {
      role: 'user',
      content: `
You're an intent classifier for a Telegram bot.

Goal: Detect if the user's message is trying to **privately whisper** or **secretly send** a message to someone.

✅ Reply "yes" only if the message:
- Mentions another user (e.g., "@username")
- Includes clear secretive words like:
  "whisper", "secret", "batana", "chupke", "sirf usko", "sirf @username ko", etc.

❌ Reply "no" for:
- Greetings, jokes, or random banter like “koi hai bhabhi”, “hello”, “kya haal”, etc.
- Any message that doesn't indicate secrecy or message delivery intent

Reply ONLY with "yes" or "no".

User message: "${userMessage}"
`.trim()
    }
  ]);

  if (!intentCheck.toLowerCase().startsWith('yes')) return false;

  // Step 2: Extract details
  const whisperInfo = await askLLM([
    {
      role: 'user',
      content: `
Extract the *exact* message that the user wants to send secretly, and the username they want to send it to.

Only return the message text as-is without summarizing, translating, or changing it.
You can take username after @ character.

Input:
"${userMessage}"

Output format (in JSON):
{"username": "akhil123", "message": "I love you"}

❌ Don't add words like "secretly", "bolo", etc.
❌ Don't rewrite or shorten the message.
✅ Only extract what's meant to be whispered.
✅ username should not include '@'
If username is missing or invalid, use null.
`.trim()
    }
  ]);

  let parsed;
  try {
    parsed = JSON.parse(whisperInfo);
  } catch (err) {
    console.error("❌ Whisper JSON parse error:", whisperInfo);
    return false;
  }

  const targetUsername = parsed.username;
  const whisperText = parsed.message;

  if (!targetUsername || typeof targetUsername !== 'string' || targetUsername.trim() === '') {
    await bot.sendMessage(chatId, `@${senderUsername} Rem ko samajh nahi aaya kisko whisper bhejna hai 🥺\nSahi se likho jaise: *rem whisper I love you to @someone*`, {
      parse_mode: 'Markdown'
    });
    return true;
  }

  if (!whisperText || whisperText.trim().length === 0) return false;

  try {
    await bot.deleteMessage(chatId, msg.message_id);

    const targetUser = await getUserInfoByUsername(targetUsername);
    const targetUserId = targetUser?.user_id || null;

    if (!targetUserId) {
      await bot.sendMessage(chatId, `@${senderUsername} Rem ko us @${targetUsername} ka user ID nahi mila 😞\nShayad wo pehle group me active nahi tha. Pehle use kuch likhne do ya join hone do.`);
      return true;
    }

    await bot.sendMessage(chatId, `🔐 *Whisper for @${targetUsername}*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🔓 Open Whisper',
            callback_data: `whisper:${targetUserId}:${targetUsername}:${whisperText}`.slice(0, 64)
          }
        ]]
      }
    });

    return true;
  } catch (err) {
    console.error("❌ Whisper button error:", err);
    return false;
  }
}

export async function handleWhisperButton(bot, query) {
  try {
    const data = query.data;
    if (!data.startsWith('whisper:')) return;

    const [_, targetUserId, targetUsername, ...msgParts] = data.split(':');
    const message = msgParts.join(':');

    if (query.from?.id?.toString() !== targetUserId) {
      await bot.answerCallbackQuery(query.id, {
        text: '⛔ Sorry, ye whisper tumhare liye nahi hai.',
        show_alert: true
      });
      return;
    }

    await bot.answerCallbackQuery(query.id, {
      text: `💌 Whisper: ${message}`,
      show_alert: true
    });
  } catch (err) {
    console.error("Whisper button click error:", err);
  }
}
