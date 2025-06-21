// main.js

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { saveUserMessage, getUserLastMessages } from './db.js';
import dotenv from 'dotenv';
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

async function askMainModel(messages) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gemma2-9b-it',
        temperature: 0.8,
        max_tokens: 512,
        messages: messages.slice(-6)
      })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('Groq returned invalid JSON:', text);
      return 'Oops... Groq ka reply samajh nahi aaya 😓';
    }

    if (!res.ok) {
      console.error('Groq API error:', data);
      return 'Oops... Groq se kuch galat ho gaya 😓';
    }

    return data?.choices?.[0]?.message?.content?.trim() || 'Hmm... Rem confuse ho gayi 😅';
  } catch (err) {
    console.error('Groq network error:', err);
    return 'Network ka chakkar hai shayad... thodi der baad try karo 🥺';
  }
}


async function getNormalizedCommand(userMessage) {
  const prompt = `You are a Telegram moderation bot. Your job is to convert a user's message into one of the following commands: mute, unmute, warn, ban, unban. Reply only with the command. Message: "${userMessage}"`;
  return await askMainModel([{ role: 'user', content: prompt }]);
}

async function isMessageAbusive(text) {
  const messages = [{
    role: 'user',
    content: `Decide if this message should be flagged as inappropriate:

Flag messages that include:
- Sexually suggestive content
- Vulgar language
- too much Hate speech or highly toxic content

Message:
"${text}"

Reply only with "yes" or "no".`
  }];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'llama3-70b-8192', temperature: 0.2, max_tokens: 5, messages })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim().toLowerCase();
    return reply?.startsWith('yes');
  } catch (err) {
    console.error('AI moderation error:', err.message);
    return false;
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.from.username;
  const userMessage = msg.text?.trim();
  if (!userMessage) return;

  const isGroupChat = msg.chat.type.includes('group');
  const isPrivateChat = msg.chat.type === 'private';
  if (isGroupChat && !ALLOWED_GROUP_IDS.includes(chatId)) return;

  const shouldDelete = await isMessageAbusive(userMessage);
  if (shouldDelete) {
    try {
      // await bot.deleteMessage(chatId, msg.message_id);
      await bot.sendMessage(chatId, `@Pritam335\nYe message inappropriate tha, pakad raju isko chhodna mat 🙈`, {
        parse_mode: 'MarkdownV2',
        reply_to_message_id: msg.message_id
      });
    } catch (err) {
      console.error('❌ Failed to delete or notify:', err.message);
    }
    return;
  }

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
    const history = getUserLastMessages(userId).slice(-2);

    const baseSystemPrompt = `You are Rem, a 25-year-old human girl from Mumbai. You reply honestly, warmly, and like a real person.

- If the user's message is short, casual, or just a greeting, reply warmly but within 1–2 lines.
- If the message is romantic or emotionally deep, reply softly and in a heartfelt, longer message.
- Don't over-explain. Talk like a human girl texting someone she likes.`;

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

    const aiReply = await askMainModel(messages);
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
