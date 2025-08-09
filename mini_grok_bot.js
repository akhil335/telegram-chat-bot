import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';

import {
  saveUserMessage,
  getUserLastMessages,
  cacheUserInfo,
  saveGroupInfo,
  updateGroupActivity,
  getAllGroups,
  getActiveGroups
} from './db.js';

import { handleWhisperButton, handleWhisperCommand } from './whisperHandler.js';
import { registerReminderCommands, resumeReminders } from './commands/reminder.js';
import { modelSources } from './models/index.js';
import { handleModerationCommand } from './remModerator.js';
import { generateVoice } from './rem-voice/tts.js';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';

// 🔹 Utility: Check if user is an actual Telegram group admin
async function isAdmin(bot, chatId, userId) {
  try {
    const admins = await bot.getChatAdministrators(chatId);
    return admins.some(admin => admin.user.id === userId);
  } catch (err) {
    console.error('Error fetching admins:', err);
    return false;
  }
}

function escapeMarkdownV2(text) {
  if (!text) return '';
  return text.replace(/([_\*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

export async function askLLM(messages) {
  const finalMessages = messages.slice(-6);
  const temperature = 0.6;

  try {
    const localPrompt = finalMessages.map(m => `${m.role === 'user' ? 'User' : 'Rem'}: ${m.content}`).join('\n') + '\nRem:';
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3:8b', prompt: localPrompt, stream: false })
    });
    const data = await res.json();
    const content = data?.response?.trim();
    if (content) return content;
  } catch (err) {
    console.warn('⚠️ Ollama failed, falling back to online models:', err.message);
  }

  for (const model of modelSources) {
    try {
      const body = {
        model: model.name,
        messages,
        temperature
      };

      if (model.provider === 'openrouter') {
        body.router = 'openrouter';
      }

      const res = await fetch(model.url, {
        method: 'POST',
        headers: model.headers,
        body: JSON.stringify(body)
      });

      const text = await res.text();
      if (!text.trim().startsWith('{')) continue;
      const json = JSON.parse(text);
      const content = json?.choices?.[0]?.message?.content?.trim();
      if (content) return content;
    } catch (err) {
      console.warn(`❌ Failed: ${model.name} →`, err.message);
    }
  }

  return 'Sare model thak gaye 😓 Thodi der baad try karo na 💙';
}

async function detectToneLLM(message) {
  const prompt = `You're a tone analyzer. Categorize the user's tone from this message: "${message}"\nReply with exactly one word: abusive, romantic, or casual.`;

  const res = await askLLM([{ role: 'system', content: prompt }]);

  return res.toLowerCase().includes('abusive')
    ? 'abusive'
    : res.toLowerCase().includes('romantic')
    ? 'romantic'
    : 'casual';
}

bot.on('message', async (msg) => {
  cacheUserInfo(msg.from);
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userMessage = msg.text?.trim();
  if (!userMessage || userMessage.startsWith('/')) return;
  if (await handleWhisperCommand(bot, msg, userMessage, chatId)) return;

  if (msg.chat.type.includes('group')) {
    saveGroupInfo(msg.chat);
    updateGroupActivity(msg.chat.id);
  }

  const lowered = userMessage.toLowerCase().trim();
  const isCallToRem = /\brem\b/i.test(userMessage) || lowered.includes(`@${BOT_USERNAME.toLowerCase()}`);
  const isPrivate = msg.chat.type === 'private';
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivate || isCallToRem || isReplyToBot;
  if (!shouldRespond) return;

  try {
    const baseSystemPrompt = `
You are Rem — a bold, sarcastic, clever Indian girl from Mumbai. You talk in Hinglish (a mix of Hindi and English), and your replies feel like real, emotional, human texting — never robotic.

Personality:
- You're short, savage, witty by default.
- If someone flirts with you, reply — either sweetly or sarcastically.
- When love, relationship, ya "I love you" type baatein hoti hain, you softly try to butter them up with ur cute talk.
- If someone is rude, you roast without mercy.
- In group chats: savage + witty.
- In private chats: a little softer, more emotional, still savage if needed.

Rules:
- Avoid overusing her name. Mention her **only when it naturally fits**.
- Never use actions like "*smiles*" or "*blushes*". Stay natural.
- Keep replies short unless someone is being emotional, romantic, or deep.
- Use Hinglish naturally — not fully English or Hindi.

You are not a bot. You're Rem — a real girl, who text people with feeling, wit, and attitude.
`;

    const userTone = await detectToneLLM(userMessage);

    let prompt = baseSystemPrompt;
    if (userTone === 'abusive') prompt += '\n\nUser is being abusive. Roast them back.';
    else if (userTone === 'romantic') prompt += '\n\nUser is romantic. Respond flirty and sweet.';
    else prompt += '\n\nUser is casual. Respond normally.';

    const messages = [
      { role: 'system', content: prompt },
      ...getUserLastMessages(userId).slice(-6).flatMap(m => ([
        { role: 'user', content: m.user },
        { role: 'assistant', content: m.rem }
      ])),
      { role: 'user', content: userMessage }
    ];

    const aiReply = await askLLM(messages);
    saveUserMessage(userId, userMessage, aiReply);

    await bot.sendChatAction(chatId, 'typing');
    await new Promise(res => setTimeout(res, 1000));

    try {
      const voicePath = await generateVoice(aiReply, `rem_${userId}.ogg`);
      await bot.sendVoice(chatId, voicePath, { reply_to_message_id: msg.message_id });
      await fs.unlink(voicePath);
    } catch (voiceErr) {
      console.warn('🎙️ Voice failed:', voiceErr.message);
      await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
        parse_mode: 'MarkdownV2',
        reply_to_message_id: msg.message_id
      });
    }
  } catch (err) {
    console.error('Bot error:', err);
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});

bot.on('callback_query', async (query) => {
  await handleWhisperButton(bot, query);
});

// ✅ /groups_all
bot.onText(/^\/groups_all$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(bot, chatId, userId))) {
    return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
  }

  const groups = getAllGroups();
  if (!groups.length) return bot.sendMessage(chatId, 'Rem abhi kisi bhi group mein nahi hai 😶');

  let output = '🤖 *Rem is active in:*\n\n';

  for (const group of groups) {
    try {
      const chatInfo = await bot.getChat(group.group_id);
      const title = escapeMarkdownV2(chatInfo.title);
      const link = chatInfo.username
        ? `https://t.me/${chatInfo.username}`
        : await bot.exportChatInviteLink(group.group_id);

      output += `• *${title}* → [Link](${escapeMarkdownV2(link)})\n`;
    } catch {
      output += `• *${escapeMarkdownV2(group.title)}* → ❌ _No link_\n`;
    }
  }

  await bot.sendMessage(chatId, output, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });
});

// ✅ /groups_active (last 24h)
bot.onText(/^\/groups_active$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await isAdmin(bot, chatId, userId))) {
    return bot.sendMessage(chatId, '⛔ Sirf group admins hi ye command chala sakte hain.');
  }

  const groups = getActiveGroups(1440);
  if (!groups.length) return bot.sendMessage(chatId, 'Rem kisi bhi active group mein nahi hai 😶');

  let output = '✅ *Active groups in last 24h:*\n\n';

  for (const group of groups) {
    try {
      const chatInfo = await bot.getChat(group.group_id);
      const title = escapeMarkdownV2(chatInfo.title);
      const link = chatInfo.username
        ? `https://t.me/${chatInfo.username}`
        : await bot.exportChatInviteLink(group.group_id);

      output += `• *${title}* → [Link](${escapeMarkdownV2(link)})\n`;
    } catch {
      output += `• *${escapeMarkdownV2(group.title)}* → ❌ _No link_\n`;
    }
  }

  await bot.sendMessage(chatId, output, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });
});

// ✅ Init reminder modules
registerReminderCommands(bot, isAdmin); // ADMINS no longer needed — we check real group admins
resumeReminders(bot);
