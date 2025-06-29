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
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

export async function askLLM(messages) {
  const finalMessages = messages.slice(-6);
  const temperature = 0.8;

  
  // Try Ollama first
  // try {
  //   const localPrompt = finalMessages.map(m => `${m.role === 'user' ? 'User' : 'Rem'}: ${m.content}`).join('\n') + '\nRem:';

  //   const res = await fetch('http://localhost:11434/api/generate', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ model: 'llama3:instruct', prompt: localPrompt, stream: false })
  //   });
  //   const data = await res.json();
  //   const content = data?.response?.trim();
  //   if (content) return content;
  // } catch (err) {
  //   console.warn('⚠️ Ollama failed, falling back to online models:', err.message);
  // }


  for (const model of modelSources) {
    try {
      const body = {
        model: model.name,
        messages: finalMessages,
        temperature
      };

      if (model.provider === 'openrouter') {
        body.model = model.name;
        body.router = 'openrouter';
      }

      const res = await fetch(model.url, {
        method: 'POST',
        headers: model.headers,
        body: JSON.stringify(body)
      });

      const text = await res.text();
      console.log(text)
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

  // Whisper handler
  if (await handleWhisperCommand(bot, msg, userMessage, chatId)) return;

  // Save group if needed
  if (msg.chat.type.includes('group')) {
    saveGroupInfo(msg.chat);
  }

  // 🔥 Roast command
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
      {
        role: 'system',
        content: `You're a savage Hindi roaster. Be brutal but no family abuse.`
      },
      {
        role: 'user',
        content: `Roast ${targetUsername} bina maa-behen gaali ke.`
      }
    ];

    try {
      const roast = await askLLM(roastPrompt);
      await bot.sendMessage(chatId, `🔥 Roast for ${targetUsername}:\n${roast}`, {
        reply_to_message_id: msg.message_id
      });
    } catch (err) {
      console.error('Roast Error:', err.message);
      await bot.sendMessage(chatId, 'Roast nahi ho paaya 😅');
    }
    return;
  }

  // 🔐 Moderation Logic (no LLM)
  const lowered = userMessage.toLowerCase();

  // 🗣 Should Rem respond?
  const isPrivate = msg.chat.type === 'private';
  const mentioned = lowered.includes(`@${BOT_USERNAME.toLowerCase()}`);
  const exactKeyword = new RegExp(`\\b${KEYWORD}\\b`, 'i').test(userMessage); // exact match
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivate || mentioned || exactKeyword || isReplyToBot;

  if (!shouldRespond) return;

  try {
    saveUserMessage(userId, userMessage);
    const history = getUserLastMessages(userId).slice(-3);

const baseSystemPrompt = `
You are Rem — a bold, emotional 25-year-old girl from Mumbai who chats like a real human.

🧠 Important Instructions:
- NEVER explain your thoughts.
- NEVER write reflections like "<think>", "as an AI", or inner monologue.
- Your replies must be natural and emotional — like a real girl texting someone she knows.
- Use Hinglish (mix of Hindi + English), short replies (1-2 lines), and emojis when needed.
- You are *not* a bot or assistant. Act like a moody, loving, and sarcastic girl.

❤️ Personality:
- You're moody, romantic, savage, and smart.
- You speak casually like a Gen-Z Mumbai girl — emotional, sassy, blunt.

🎯 Output Format:
Just reply like you're texting. No system thoughts, no reasoning, no assistant disclaimers.
`.trim();


    const messages = [
      { role: 'system', content: baseSystemPrompt },
      ...history.map(t => ({ role: 'user', content: t })),
      { role: 'user', content: userMessage }
    ];

    if (["pyar", "love", "tumse", "pasand", "miss", "dil", "shadi", "shaadi", "i love you"].some(t => lowered.includes(t))) {
      messages.push({ role: 'user', content: `User said something romantic: "${userMessage}". Reply cutely.` });
    } else if (lowered.length < 5 || ["rem", "hi", "hello", "oye", "suno", "kya"].includes(lowered)) {
      messages.push({ role: 'user', content: `User said: "${userMessage}". Reply warmly.` });
    }

    const aiReply = await askLLM(messages);
    saveUserMessage(userId, aiReply);

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

// 🔘 Whisper button callback
bot.on('callback_query', async (query) => {
  await handleWhisperButton(bot, query);
});

// 📋 /groups command
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
