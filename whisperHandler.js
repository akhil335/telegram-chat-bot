// whisper.js
import { askLLM } from './mini_grok_bot.js';
import { getUserInfoByUsername } from './db.js';
import crypto from 'crypto';

// In-memory whisper store (use Redis/DB if you want persistence)
const whisperStore = new Map();

// Helper to safely delete messages without crashing
async function safeDelete(bot, chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (err) {
    const desc = err.response?.body?.description || "";
    if (desc.includes("message to delete not found")) {
      console.log(`⚠️ Message ${messageId} not found (already deleted).`);
    } else if (desc.includes("not enough rights")) {
      console.log(`⚠️ Bot is not admin, cannot delete messages in chat ${chatId}.`);
    } else {
      console.error("❌ Unexpected deleteMessage error:", err);
    }
  }
}

export async function handleWhisperCommand(bot, msg, userMessage, chatId) {
  const senderUsername = msg.from.username;
  const senderId = msg.from.id;

  // ⚡️ Step 0: Quick filter
  const maybeWhisper = /@[\w\d_]+/.test(userMessage) &&
    /(whisper|secret|chup|sirf|dm|private|batana)/i.test(userMessage);
  if (!maybeWhisper) return false;

  // Step 1: Confirm with LLM
  const intentCheck = await askLLM([{
    role: 'user',
    content: `
You're an intent classifier for a Telegram bot.
Goal: Detect if the user's message is trying to **privately whisper** or **secretly send** a message to someone.

✅ Reply "yes" only if the message:
- Mentions another user (e.g., "@username")
- Includes clear secretive words like:
  "whisper", "secret", "batana", "chupke", "sirf usko", etc.

❌ Reply "no" for casual chat.

Reply ONLY with "yes" or "no".

User message: "${userMessage}"
`.trim()
  }]);

  if (!intentCheck.toLowerCase().startsWith("yes")) return false;

  // Step 2: Extract whisper details
  const whisperInfo = await askLLM([{
    role: 'user',
    content: `
Extract the *exact* message that the user wants to send secretly, and the username they want to send it to.

Return JSON in this format:
{"username": "akhil123", "message": "I love you"}

❌ Don't modify the text.
❌ Don't include '@' in username.
✅ If username missing, return {"username": null, "message": "..."}
Input: "${userMessage}"
`.trim()
  }]);

  let parsed;
  try {
    parsed = JSON.parse(whisperInfo);
  } catch (err) {
    console.error("❌ Whisper JSON parse error:", whisperInfo);
    return false;
  }

  const targetUsername = parsed.username;
  const whisperText = parsed.message;

  if (!targetUsername || typeof targetUsername !== "string" || targetUsername.trim() === "") {
    await bot.sendMessage(chatId,
      `@${senderUsername} Rem ko samajh nahi aaya kisko whisper bhejna hai 🥺\nSahi se likho jaise: *rem whisper I love you to @someone*`,
      { parse_mode: "Markdown" }
    );
    return true;
  }

  if (!whisperText || whisperText.trim().length === 0) return false;

  // Step 3: Store whisper and send button
  await safeDelete(bot, chatId, msg.message_id);

  const targetUser = await getUserInfoByUsername(targetUsername);
  const targetUserId = targetUser?.user_id || null;

  if (!targetUserId) {
    await bot.sendMessage(chatId,
      `@${senderUsername} Rem ko us @${targetUsername} ka user ID nahi mila 😞\nShayad wo pehle group me active nahi tha. Pehle use kuch likhne do ya join hone do.`
    );
    return true;
  }

  // Generate random ID for whisper storage
  const whisperId = crypto.randomBytes(8).toString("hex");
  whisperStore.set(whisperId, {
    to: targetUserId.toString(),
    from: senderId.toString(),
    username: targetUsername,
    text: whisperText,
    createdAt: Date.now()
  });

  await bot.sendMessage(chatId, `🔐 *Whisper for @${targetUsername}*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "🔓 Open Whisper", callback_data: `whisper:${whisperId}` }
      ]]
    }
  });

  return true;
}

export async function handleWhisperButton(bot, query) {
  try {
    if (!query.data.startsWith("whisper:")) return;

    const whisperId = query.data.split(":")[1];
    const whisper = whisperStore.get(whisperId);

    if (!whisper) {
      await bot.answerCallbackQuery(query.id, {
        text: "❌ Whisper expired or invalid.",
        show_alert: true
      });
      return;
    }

    if (query.from?.id?.toString() !== whisper.to) {
      await bot.answerCallbackQuery(query.id, {
        text: "⛔ Sorry, ye whisper tumhare liye nahi hai.",
        show_alert: true
      });
      return;
    }

    await bot.answerCallbackQuery(query.id, {
      text: `💌 Whisper: ${whisper.text}`,
      show_alert: true
    });

    // Optional: delete after viewing once
    whisperStore.delete(whisperId);
  } catch (err) {
    console.error("Whisper button click error:", err);
  }
}
