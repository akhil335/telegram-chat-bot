// main bot file

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { saveUserMessage, getUserLastMessages } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

import { handleModerationCommand } from './remModerator.js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPEN_ROUTER_API = process.env.OPEN_ROUTER_API;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';
const KEYWORD = 'rem';
const OWNER_USERNAME = 'Pritam335';

const ALLOWED_GROUP_IDS = [-1001721317114];
const ADMINS = ['Pritam335', 'almirzsa'];

function escapeMarkdownV2(text) {
  if (!text) return '';
  return text.replace(/([_\*\[\]()~`>#+=|{}.!\\\-])/g, '\\$1');
}

async function askMainModel(messages) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        temperature: 0.8,
        messages
      })
    });

    const data = await res.json();
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
  const prompt = `Convert this into a moderation command. Assume the message is targeting the person being replied to.
Examples:
- "rem isko 10 min ke liye mute kar do" => "mute @username for 10 min"
- "ban this guy" => "ban @username"
- "isko warn karo" => "warn @username"

User message: "${userMessage}"

Output:`;

  return await askMainModel([{ role: 'user', content: prompt }]);
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

  const mentioned = userMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`);
  const hasKeyword = userMessage.toLowerCase().includes(KEYWORD);
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivateChat || mentioned || hasKeyword || isReplyToBot;

  const lowered = userMessage.toLowerCase();
  const containsModKeyword = ['warn', 'mute', 'ban'].some(k => lowered.includes(k));

  if (containsModKeyword && msg.reply_to_message) {
    if (!ADMINS.includes(username)) {
      await bot.sendMessage(chatId, escapeMarkdownV2(`Sorry 😣 par mai ye nahi kar sakti!`), {
        parse_mode: 'MarkdownV2',
        reply_to_message_id: msg.message_id
      });
      return;
    }

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
    }
    else if (cleaned.includes('mute')) {
      const muteDuration = duration || '2 hour';
      response = await handleModerationCommand(`mute @${targetUsername} for ${muteDuration}`, userIdMap, bot, msg.chat, msg);
    }
    else if (cleaned.includes('ban')) {
      response = await handleModerationCommand(`ban @${targetUsername}`, userIdMap, bot, msg.chat, msg);
    } else if (cleaned.includes('warn')) {
      response = await handleModerationCommand(`warn @${targetUsername}`, userIdMap, bot, msg.chat, msg);
    }

    if (response) {
      await bot.sendMessage(chatId, escapeMarkdownV2(response), {
        parse_mode: 'MarkdownV2',
        reply_to_message_id: msg.message_id
      });
    }
    return;
  }

  if (!shouldRespond) return;

  try {
    saveUserMessage(userId, userMessage);
    const history = getUserLastMessages(userId);
    const messages = [
      {
        role: 'system',
        content: `
You are Rem — a normal, serious 25-year-old human girl from Mumbai.  
You never flirt, never roleplay, and never write in a dramatic or exaggerated way.

You do **not** use asterisks or describe actions like *smiles*, *blushes*, *pouts*, *giggles*, etc.  
You do **not** talk like anime characters or do anything fantasy-like.

You speak calmly, normally, and seriously — like a real 25-year-old woman chatting on Telegram.

Your tone is mature, polite, direct, and realistic.  
Avoid emojis, and keep your replies practical, brief, and human.

Always respond honestly and like a normal person.
`.trim()
      },
      ...history.map(t => ({ role: 'user', content: t })),
      { role: 'user', content: userMessage }
    ];

    const cleaned = userMessage.toLowerCase();
    const romanticTriggers = ['pyar', 'love', 'tumse', 'pasand', 'miss', 'dil', 'shadi', 'shaadi', 'i love you'];

    if (romanticTriggers.some(t => cleaned.includes(t))) {
      messages.push({
        role: 'user',
        content: `User just said something very sweet or romantic: "${userMessage}". Blush a little and respond emotionally and cutely as a girl would when someone confesses love. Keep it short. No roleplay or asterisks.`
      });
    } else if (cleaned.length < 5 || ['rem', 'hi', 'hello', 'oye', 'suno', 'kya'].includes(cleaned)) {
      messages.push({
        role: 'user',
        content: `User said: "${userMessage}". It was short or casual. Reply cutely and warmly, like you're talking to someone special. No drama, no actions.`
      });
    }

    const aiReply = await askMainModel(messages);
    saveUserMessage(userId, aiReply);

    await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
      parse_mode: 'MarkdownV2',
      ...(msg.message_id ? { reply_to_message_id: msg.message_id } : {})
    });
  } catch (err) {
    console.error('Bot error:', err);
    await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
  }
});
