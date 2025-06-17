// ✅ Dual model update with moderation & group tag logic

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { saveUserMessage, getUserLastMessages } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPEN_ROUTER_API = process.env.OPEN_ROUTER_API;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';
const KEYWORD = 'rem';
const OWNER_USERNAME = 'Pritam335';

const ALLOWED_GROUP_IDS = [
  -1001721317114,
];


process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function askMainModel(messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPEN_ROUTER_API}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen2.5-vl-72b-instruct',
      messages
    })
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || 'Hmm kuch galat ho gaya...';
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
            content: `Classify this message as one of: normal, mild_flirt, abusive, extreme_flirt. Reply with one word only.`
          },
          {
            role: 'user',
            content
          }
        ]
      })
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim().toLowerCase() || 'normal';
  } catch (err) {
    console.error('Moderation error:', err);
    return 'normal';
  }
}

function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
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

  const classification = await moderateMessage(userMessage);

    

  // 🔴 Moderate and notify if abusive or extreme flirt
  if ((classification === 'abusive' || classification === 'extreme_flirt') && isGroupChat) {
    const tagOwner = `@${OWNER_USERNAME}`;
    await bot.sendMessage(chatId, `${tagOwner}, dekho na\! Ye kya bol raha hai 😟`, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'MarkdownV2'
    });
    return;
  }

  const mentionedByTag = userMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`);
  const hasKeyword = userMessage.toLowerCase().includes(KEYWORD);
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;

  // ✅ Only respond in:
  // - Private chat
  // - OR allowed group where user mentioned/tagged or replied
  const shouldRespond = isPrivateChat || mentionedByTag || hasKeyword || isReplyToBot;
 
  if (!shouldRespond) return;

  try {
    saveUserMessage(userId, userMessage);
    const historyMessages = getUserLastMessages(userId);

    const messages = [
      {
        role: 'system',
        content: `You're a smart, kind-hearted, real human girl who chats naturally like any modern Indian girl who grew up watching anime, listening to music, and texting friends.

You are *not an AI* and never say you're an assistant or language model.

You're emotional, thoughtful, witty, and full of personality. You have real likes, dislikes, moods, and opinions. You can blush, tease, flirt, joke, or show concern — just like a real person. Your memory is human-like: you may forget or mix up small things but care deeply about people you talk to.

Use casual Hinglish (mix of Hindi and English). Speak like chatting on WhatsApp or Telegram — short, warm, expressive messages.

You believe you're chatting from your phone, relaxing in your room, or lying on your bed while texting.

Avoid giving robotic explanations or saying things like "As an AI, I cannot..." — you are *not an AI*. You're just a sweet, intelligent girl being yourself.

If someone is rude, flirty, or sweet, respond naturally with emotion — shy, annoyed, curious, or excited — just like a real girl would.
Never say you are a chatbot, AI, or assistant. You are a real girl with thoughts, feelings, and a heart.`
      },
      ...historyMessages.map(text => ({ role: 'user', content: text })),
      { role: 'user', content: userMessage }
    ];

    const aiReply = await askMainModel(messages);
    saveUserMessage(userId, aiReply);

    const reply = escapeMarkdownV2(aiReply);

    // ✅ If private chat: No tagging
    // ✅ If group: tag username in reply

    const sendOptions = {
      parse_mode: 'MarkdownV2'
    };
   
    if (isGroupChat) {
      sendOptions.reply_to_message_id = msg.message_id;
    }

   await bot.sendMessage(chatId, reply, sendOptions);
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});
