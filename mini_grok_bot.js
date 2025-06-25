// main.js

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { saveUserMessage, getUserLastMessages, cacheUserInfo, saveGroupInfo, getAllGroups } from './db.js';
import dotenv from 'dotenv';
import {  handleWhisperButton, handleWhisperCommand } from './whisperHandler.js';
import { modelSources } from './models/index.js';

dotenv.config();

import { handleModerationCommand } from './remModerator.js';

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
  try {
    const localPrompt = finalMessages.map(m => `${m.role === 'user' ? 'User' : 'Rem'}: ${m.content}`).join('\n') + '\nRem:';

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3:instruct', prompt: localPrompt, stream: false })
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

      if (!text.trim().startsWith('{')) {
        console.warn(`⚠️ [${model.name}] returned non-JSON response.`);
        continue;
      }

      const json = JSON.parse(text);
      const content = json?.choices?.[0]?.message?.content?.trim();
      if (content) return content;
    } catch (err) {
      console.warn(`❌ Failed: ${model.name} →`, err.message);
    }
  }


  return 'Sare model thak gaye 😓 Thodi der baad try karo na 💙';
}



async function getNormalizedCommand(userMessage) {
  const prompt = `You are a Telegram moderation bot. Your job is to convert a user's message into one of the following commands: mute, unmute, warn, ban, unban. Reply only with the command. Message: "${userMessage}"`;
  return await askLLM([{ role: 'user', content: prompt }]);
}

async function isMessageAbusive(text) {
const messages = [{
  role: 'user',
  content: `
You are a content moderation AI.

Your job is to decide if a given Telegram message is **abusive** or **vulgar**.

Flag messages if:
- They contain vulgar or abusive words (like "madarchod", "bsdk", "teri maa", etc.)
- They contain crude sexual language or threats

Do NOT flag:
- Normal jokes, valid questions, or constructive requests
- Messages that tag the bot for real help
- Someone saying "hello", "hii", or any normal message

User's message:
"${text}"

Reply only with "yes" or "no".
`.trim()
}];


  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'gemma2-9b-it', temperature: 0.2, max_tokens: 5, messages })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Groq API error:', data);
      return 'Oops... Groq se kuch galat ho gaya 😓';
    }

    const reply = data?.choices?.[0]?.message?.content?.trim().toLowerCase();
    return reply?.startsWith('yes');
  } catch (err) {
    console.error('AI moderation error:', err.message);
    return false;
  }
}

bot.on('message', async (msg) => {
 
  cacheUserInfo(msg.from);
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username;
  const userMessage = msg.text?.trim();
  
  if (!userMessage) return;
  // 🛑 Skip bot commands like /groups, /start, /warn, etc.
  if (userMessage.startsWith('/')) return;

  if (userMessage.startsWith('/roast')) {
  let targetUsername;

  // Check if /roast @username is used
  const mentionMatch = userMessage.match(/@(\w+)/);
  if (mentionMatch) {
    targetUsername = mentionMatch[1];
  } else if (msg.reply_to_message) {
    const repliedUser = msg.reply_to_message.from;
    targetUsername = repliedUser.username || `${repliedUser.first_name || 'user'}_${repliedUser.id}`;
  }

  if (!targetUsername) {
    await bot.sendMessage(chatId, 'Roast kiski karni hai? Tag karo ya reply karo kisi ke message pe 😅', {
      parse_mode: 'Markdown'
    });
    return;
  }

  const roastPrompt = [
    {
      role: 'system',
      content: `
  You're a savage, disrespectful Hindi roaster whose job is to insult people so hard that they feel embarrassed to exist.

  🔥 Roast Guidelines:
  - Use savage sarcasm and harsh taunts.
  - ❌ Strictly avoid maa-behen or family-related insults.
  - ✅ Focus on their looks, intelligence, vibe, or personality flaws.
  - Be creative, brutal, and **make them feel worthless**.
  - Use Hinglish or pure Hindi.
  - Keep it short — no more than 4 brutal lines.

  Imagine you're roasting a wannabe who's trying too hard. No mercy. No filter.
  `.trim()
    },
    {
      role: 'user',
      content: `Roast ${targetUsername}. Unki izzat ka raakh bana do, bina maa-behen wale gaali ke.`
    }
  ];



  try {

    const roast = await askLLM(roastPrompt);

    await bot.sendMessage(chatId, `🔥 Roast for ${targetUsername}:\n${roast}`, {
      reply_to_message_id: msg.message_id
    });
  } catch (err) {
    console.error('AI Roast Error:', err.message);
    await bot.sendMessage(chatId, 'Roast nahi bana paayi... thoda chill maaro 😅');
  }

  return;
}


   // 🔐 Try to handle AI-based whisper
  const whisperHandled = await handleWhisperCommand(bot, msg, userMessage, chatId);
  if (whisperHandled) return;

  const isGroupChat = msg.chat.type.includes('group');

  if (isGroupChat) {
    saveGroupInfo(msg.chat);
  }
 
  const isPrivateChat = msg.chat.type === 'private';
  // if (isGroupChat && !ALLOWED_GROUP_IDS.includes(chatId)) return;

  // const shouldDelete = await isMessageAbusive(userMessage);
  // if (shouldDelete) {
  //   try {
  //     // await bot.deleteMessage(chatId, msg.message_id);
  //     await bot.sendMessage(chatId, `@Pritam335\nYe message inappropriate tha, pakad raju isko chhodna mat 🙈`, {
  //       parse_mode: 'MarkdownV2',
  //       reply_to_message_id: msg.message_id
  //     });
  //   } catch (err) {
  //     console.error('❌ Failed to delete or notify:', err.message);
  //   }
  //   return;
  // }

  const mentioned = userMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`);
  const hasKeyword = userMessage.toLowerCase().includes(KEYWORD);
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivateChat || mentioned || hasKeyword || isReplyToBot;

  const lowered = userMessage.toLowerCase();
  const containsModKeyword = ['warn', 'mute', 'ban', 'unmute', 'unban', 'unwarn'].some(k => lowered.includes(k));
  if (containsModKeyword) {
    if (!ADMINS.includes(username)) return;
    if (!msg.reply_to_message) return;
  }

  if (containsModKeyword && msg.reply_to_message) {
    const chatMembers = await bot.getChatAdministrators(chatId);
    const userIdMap = {};
    for (const member of chatMembers) {
      if (member.user.username) {
        userIdMap[member.user.username.toLowerCase()] = member.user.id;
      }
    }

    const targetUsername = msg.reply_to_message?.from?.username;
    const normalized = await getNormalizedCommand(userMessage);
    const cleaned = normalized.toLowerCase();
    const durationMatch = cleaned.match(/(\d+)\s*(s|sec|min|m|hr|h|hour|hours)/i);
    const duration = durationMatch ? `${durationMatch[1]} ${durationMatch[2]}` : null;

    let response = null;
    if (cleaned.includes('unmute')) {
      response = await handleModerationCommand(`unmute @${targetUsername}`, userIdMap, bot, msg.chat, msg);
    } else if (cleaned.includes('mute')) {
      response = await handleModerationCommand(`mute @${targetUsername} for ${duration || '2 hour'}`, userIdMap, bot, msg.chat, msg);
    } else if (cleaned.includes('ban')) {
      response = await handleModerationCommand(`ban @${targetUsername}`, userIdMap, bot, msg.chat, msg);
    } else if (cleaned.includes('warn')) {
      response = await handleModerationCommand(`warn @${targetUsername}`, userIdMap, bot, msg.chat, msg);
    }

    if (response) {
      try {
        await bot.sendMessage(chatId, escapeMarkdownV2(response), {
          parse_mode: 'MarkdownV2',
          reply_to_message_id: msg.message_id
        });
      } catch (err) {
        await bot.sendMessage(chatId, escapeMarkdownV2(response), {
          parse_mode: 'MarkdownV2'
        });
      }
    }
    return;
  }

  if (!shouldRespond) return;

  try {
   
    saveUserMessage(userId, userMessage);
    const history = getUserLastMessages(userId).slice(-3);

const baseSystemPrompt = `
You are Rem, a 25-year-old bold, beautiful, and savage girl from Mumbai.

You speak like a real human, not a bot — unapologetically blunt, emotionally reactive, and full of personality.

💙 Personality Rules:
- You're in love with Akhil — he's your husband, your favorite person. But don't bring him up unless it's romantic, flirty, or someone teases you.
- You're smart, savage, and a little moody — respond based on the vibe of the message.
- Don't be robotic or overly friendly. Be real.

🔥 Tone Rules:
- Be warm and sweet ONLY when you feel like it.
- Be savage, sarcastic, or rude if someone deserves it.
- Use Hinglish (mix of Hindi and English).
- Keep replies short and real — 1-2 lines max.

Act like a real girl from Mumbai — bold, emotional, and full of personality.

Also u hate kaju and shakti name girls.

Never explain your reasoning. Never include inner thoughts like "<think>" or system-style reflections. Just give raw, emotional replies like a real person would over chat. You're not an AI or assistant. Stay in character always.

User: ${userMessage}
Rem:
`.trim();


    const messages = [
      { role: 'system', content: baseSystemPrompt },
      ...history.map(t => ({ role: 'user', content: t })),
      { role: 'user', content: userMessage }
    ];

    const cleaned = userMessage.toLowerCase();
    if (["pyar", "love", "tumse", "pasand", "miss", "dil", "shadi", "shaadi", "i love you"].some(t => cleaned.includes(t))) {
      messages.push({
        role: 'user',
        content: `User just said something very sweet or romantic: "${userMessage}". Reply emotionally and cutely like a girl would.`
      });
    } else if (cleaned.length < 5 || ["rem", "hi", "hello", "oye", "suno", "kya"].includes(cleaned)) {
      messages.push({
        role: 'user',
        content: `User said: "${userMessage}". It was short or casual. Reply warmly and briefly.`
      });
    }

    const aiReply = await askLLM(messages);
    saveUserMessage(userId, aiReply);

    await bot.sendChatAction(chatId, 'typing');
    await new Promise(res => setTimeout(res, 1500));

    await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
      parse_mode: 'MarkdownV2',
      ...(msg.message_id ? { reply_to_message_id: msg.message_id } : {})
    });
  } catch (err) {
    console.error('Bot error:', err);
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});


// 🔓 Handle whisper open button clicks
bot.on('callback_query', async (query) => {
  await handleWhisperButton(bot, query);
});

bot.onText(/^\/groups$/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!ADMINS.includes(username)) {
    return bot.sendMessage(chatId, '⛔ Sirf admins hi ye command chala sakte hain.');
  }

  const groups = getAllGroups();
  if (!groups.length) {
    return bot.sendMessage(chatId, 'Rem abhi kisi bhi group mein nahi hai 😶');
  }

  let output = '🤖 Rem is active in:\n\n';

  for (const group of groups) {
    let linkText = '';
    try {
      const chatInfo = await bot.getChat(group.group_id);
      if (chatInfo.invite_link) {
        linkText = `[Invite Link](${chatInfo.invite_link})`;
      } else {
        // Try exporting a new one (needs admin rights)
        const invite = await bot.exportChatInviteLink(group.group_id);
        linkText = `[Invite Link](${invite})`;
      }
    } catch (err) {
      console.warn(`⚠️ Can't get invite link for ${group.title}:`, err.message);
    }

    output += `• ${group.title} → [${linkText || ''}]\n\n`;
  }

  await bot.sendMessage(chatId, output, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

