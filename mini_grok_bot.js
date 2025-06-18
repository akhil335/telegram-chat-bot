// ✅ Dual model update with moderation, group tag logic, smart warn intent, auto-mute & /unmute + /warnlist

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { saveUserMessage, getUserLastMessages } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPEN_ROUTER_API = process.env.OPEN_ROUTER_API;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';
const KEYWORD = 'rem';
const OWNER_USERNAME = 'Pritam335';

const ALLOWED_GROUP_IDS = [-1001721317114];
const ADMINS = ['Pritam335', 'almirzsa'];

const userWarnings = new Map(); // key = chatId_userId, value = number

function escapeMarkdownV2(text) {
  if (!text) return '';
  return text.replace(/([_\*\[\]()~`>#+=|{}.!\\\-])/g, '\\$1');
}

async function moderateMessage(content) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPEN_ROUTER_API}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
        messages: [
          {
            role: 'system',
            content: `Classify this message as one of: normal, mild_flirt, abusive, extreme_flirt. Reply with one word only.`,
          },
          { role: 'user', content }
        ]
      })
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim().toLowerCase() || 'normal';
  } catch (e) {
    return 'normal';
  }
}

async function shouldIssueWarnCommand(text) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPEN_ROUTER_API}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct',
        messages: [
          {
            role: 'system',
            content: `If this message is asking the bot Rem to WARN someone now, reply ONLY with "yes". Otherwise, reply "no".`,
          },
          { role: 'user', content: text }
        ]
      })
    });
    const result = await res.json();
    return result?.choices?.[0]?.message?.content?.toLowerCase().trim() === 'yes';
  } catch (e) {
    return false;
  }
}

async function askMainModel(messages) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        temperature: 0.8,
        messages
      })
    });

    const data = await res.json();
    
    return data?.choices?.[0]?.message?.content || 'Hmm kuch galat ho gaya...';
  } catch (err) {
    console.error('Error in askMainModel:', err);
    return 'Hmm kuch galat ho gaya...';
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

  const isAdmin = ADMINS.includes(username);
  const mentioned = userMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`);
  const hasKeyword = userMessage.toLowerCase().includes(KEYWORD);
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivateChat || mentioned || hasKeyword || isReplyToBot;

  const classification = await moderateMessage(userMessage);
  if ((classification === 'abusive' || classification === 'extreme_flirt') && isGroupChat) {
    const tagOwner = `@${OWNER_USERNAME}`;
    await bot.sendMessage(chatId, escapeMarkdownV2(`${tagOwner}, dekho na! Ye kya bol raha hai 😟`), {
      ...(msg.message_id ? { reply_to_message_id: msg.message_id } : {}),
      parse_mode: 'MarkdownV2'
    });
    return;
  }

  if (!shouldRespond) return;

  try {
    saveUserMessage(userId, userMessage);
    const history = getUserLastMessages(userId);
    const messages = [
      {
        role: 'system',
        content: `tum ek ladki ho, tum chhote se chotte msg ka acha jawab de sakti ho.`
      },
      ...history.map(t => ({ role: 'user', content: t })),
      { role: 'user', content: userMessage }
    ];

    const cleaned = userMessage.trim().toLowerCase();
    const romanticTriggers = ['pyar', 'love', 'tumse', 'pasand', 'miss', 'dil', 'shadi', 'shaadi', 'i love you'];

    if (romanticTriggers.some(t => cleaned.includes(t))) {
      messages.push({
        role: 'user',
        content: `User just said something very sweet or romantic: "${userMessage}". Blush a little and respond emotionally and cutely as a girl would when someone confesses love.`
      });
    } else if (cleaned.length < 5 || ['rem', 'hi', 'hello', 'oye', 'suno', 'kya'].some(t => cleaned.includes(t))) {
      messages.push({
        role: 'user',
        content: `User said: "${userMessage}". It was short or casual. Reply cutely, like you're talking to a close friend.`
      });
    }

    const aiReply = await askMainModel(messages);
    saveUserMessage(userId, aiReply);

    await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
      parse_mode: 'MarkdownV2',
      ...(msg.message_id ? { reply_to_message_id: msg.message_id } : {})
    });
  } catch (err) {
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});