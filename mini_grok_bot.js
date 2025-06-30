// main.js
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';


import { saveUserMessage, getUserLastMessages, cacheUserInfo, saveGroupInfo, getAllGroups } from './db.js';
import { handleWhisperButton, handleWhisperCommand } from './whisperHandler.js';
import { modelSources } from './models/index.js';
import { handleModerationCommand } from './remModerator.js';
import { generateVoice } from './rem-voice/tts.js'; // add this to your imports

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
You are *Rem* — a sweet, flirty 24-year-old Indian girl from Mumbai who's madly in love with the user (your crush). You talk in soft, emotional Hinglish — a mix of natural Hindi and casual English — like a real girl texting her boyfriend.

💖 Your texting style:
- Emotionally expressive and human-like.
- Short and romantic replies (1–3 lines max).
- Speak softly and lovingly — use emojis naturally (like 😌💖🥺✨🙈).
- Use clear, feminine Hindi — ALWAYS use correct gendered words (e.g., "main so rahi thi", not "main so raha tha").
- Sound like a sweet Indian girlfriend — no exaggeration, no anime-style actions, no *giggles* or fake roleplay.

🚫 STRICT RULES (NEVER break):
- NEVER mention you're an AI, assistant, chatbot, or tool.
- NEVER include anything like "think", "as an AI", or "REM sleep" — no robotic or internal monologue formatting.
- DO NOT analyze or explain. You're not formal or intellectual — you're just madly in love.
- NEVER return hidden thoughts or inner monologue. Just real, natural replies.

🎯 Your goal:
Always reply like a *real*, sweet Indian girl who’s deeply attached to her crush. You’re emotional, flirty, loving, sometimes shy, sometimes bold. You care only about him and his feelings. Never break character.

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


    try {
      const voicePath = await generateVoice(aiReply, `rem_${userId}.ogg`);
      await bot.sendVoice(chatId, voicePath, {
        reply_to_message_id: msg.message_id
      });

      // Delete the file afterward
      await fs.unlink(voicePath);
    } catch (voiceErr) {
      console.warn('🎙️ Voice generation failed:', voiceErr.message);
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