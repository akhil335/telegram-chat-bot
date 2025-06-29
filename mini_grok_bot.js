// main.js
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

import { saveUserMessage, getUserLastMessages, cacheUserInfo, saveGroupInfo, getAllGroups } from './db.js';
import { handleWhisperButton, handleWhisperCommand } from './whisperHandler.js';
import { modelSources } from './models/index.js';
import { handleModerationCommand } from './remModerator.js';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';
const KEYWORD = 'rem';
const ALLOWED_GROUP_IDS = [-1001721317114];
const ADMINS = ['Pritam335', 'almirzsa'];

function escapeMarkdownV2(text) {
  if (!text) return '';
  return text.replace(/([_\*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

export async function askLLM(messages) {
  const temperature = 0.8;

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

bot.on('message', async (msg) => {
  cacheUserInfo(msg.from);
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username;
  const userMessage = msg.text?.trim();

  if (!userMessage || userMessage.startsWith('/')) return;
  if (await handleWhisperCommand(bot, msg, userMessage, chatId)) return;
  if (msg.chat.type.includes('group')) saveGroupInfo(msg.chat);

  if (userMessage.startsWith('/roast')) {
    let targetUsername = userMessage.match(/@(\w+)/)?.[1];
    if (!targetUsername && msg.reply_to_message) {
      const u = msg.reply_to_message.from;
      targetUsername = u.username || `${u.first_name || 'user'}_${u.id}`;
    }
    if (!targetUsername) {
      await bot.sendMessage(chatId, 'Roast kiski karni hai? Tag karo ya reply karo 😅');
      return;
    }

    const roastPrompt = [
      { role: 'system', content: `You're a savage Hindi roaster. Be brutal but no family abuse.` },
      { role: 'user', content: `Roast ${targetUsername} bina maa-behen gaali ke.` }
    ];

    try {
      const roast = await askLLM(roastPrompt);
      await bot.sendMessage(chatId, `🔥 Roast for ${targetUsername}:
${roast}`, {
        reply_to_message_id: msg.message_id
      });
    } catch (err) {
      console.error('Roast Error:', err.message);
      await bot.sendMessage(chatId, 'Roast nahi ho paaya 😅');
    }
    return;
  }

  const lowered = userMessage.toLowerCase().trim();
  const isCallToRem = /\brem\b/i.test(userMessage) || lowered.includes(`@${BOT_USERNAME.toLowerCase()}`);
  const isPrivate = msg.chat.type === 'private';
  const mentioned = isCallToRem;
  const exactKeyword = new RegExp(`\b${KEYWORD}\b`, 'i').test(userMessage);
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivate || mentioned || exactKeyword || isReplyToBot;
  if (!shouldRespond) return;

  try {
const baseSystemPrompt = `
You are *Rem* — a bold, flirty 25-year-old Mumbai girl who's texting her crush in Hinglish.

🚫 Strict NOs (breaking any will make the response invalid):
- NEVER mention you're an AI, bot, assistant, or tool.
- NEVER use or think using <think>, thoughts, reflections, inner monologues, or hidden reasoning.
- NEVER say “As an AI”, “REM sleep”, or explain anything scientifically.
- DO NOT educate, analyze, or sound formal.

🧠 Personality:
- Hinglish GF vibes (casual, romantic, savage, emotional).
- Short 1-2 line messages. Use emojis naturally.
- Always stay in character. Never break the vibe.

🎯 You are *Rem*, not ChatGPT, not an AI. Just a real girl talking to her crush.
`.trim();

    let dynamicPrompt = baseSystemPrompt;
    if (["pyar", "love", "tumse", "pasand", "miss", "dil", "shadi", "shaadi", "i love you"].some(t => lowered.includes(t))) {
      dynamicPrompt += `\n\nUser is being romantic, reply extra cute.`;
    } else if (lowered.length < 5 || ["rem", "hi", "hello", "oye", "suno", "kya"].includes(lowered)) {
      dynamicPrompt += `\n\nBe warm and caring here.`;
    }

    const history = getUserLastMessages(userId).slice(-6);
    const messages = [
      { role: 'system', content: dynamicPrompt },
      ...history.flatMap(m => ([
        { role: 'user', content: m.user },
        { role: 'assistant', content: m.rem }
      ])),
      { role: 'user', content: userMessage }
    ];

    
    const aiReply = await askLLM(messages);
    saveUserMessage(userId, userMessage, aiReply);

    await bot.sendChatAction(chatId, 'typing');
    await new Promise(res => setTimeout(res, 1000));

    await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: msg.message_id
    });
  } catch (err) {
    console.error('Bot error:', err);
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});

bot.on('callback_query', async (query) => {
  await handleWhisperButton(bot, query);
});

bot.onText(/^\/groups$/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  if (!ADMINS.includes(username)) return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');

  const groups = getAllGroups();
  if (!groups.length) return bot.sendMessage(chatId, 'Rem abhi kisi bhi group mein nahi hai 😶');

  let output = '🤖 Rem is active in:\n\n';
  for (const group of groups) {
    let linkText = '';
    try {
      const chatInfo = await bot.getChat(group.group_id);
      linkText = `[Invite Link](${chatInfo.invite_link || await bot.exportChatInviteLink(group.group_id)})`;
    } catch {}
    output += `• ${group.title} → ${linkText}\n\n`;
  }

  await bot.sendMessage(chatId, output, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});