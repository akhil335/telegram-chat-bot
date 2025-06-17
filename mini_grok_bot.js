// Required packages
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
// Import your db functions
import { saveUserMessage, getUserLastMessages } from './db.js';


// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config(); // call this early at the top

// Your credentials
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Bot username (without @) - replace with your bot's actual username or fetch dynamically later
const BOT_USERNAME = 'rem_the_maid_bot';
const KEYWORD = 'rem';

// Groq AI request with conversation context
async function askGroq(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192',
      messages: messages
    })
  });

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || 'Sorry Subaru-kun, kuch samajh nahi aaya...';
}

// DuckDuckGo web scraping fallback
async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);
    const snippet = $('.result__snippet').first().text().trim();
    return snippet || 'Kuch useful info nahi mila online...';
  } catch (err) {
    console.error('DuckDuckGo failed:', err);
    return 'Online info lana mein thodi problem aa gayi...';
  }
}

// Replace {{fetch:search:...}} with live web data
async function maybeFetchWebAnswer(reply, originalQuestion) {
  const match = reply.match(/\{\{fetch:search:(.*?)\}\}/);
  if (match) {
    const query = match[1].trim() || originalQuestion;
    const webData = await searchDuckDuckGo(query);
    return reply.replace(match[0], webData);
  }
  return reply;
}

// Main message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userMessage = msg.text?.trim();
  if (!userMessage) return;

  const isGroupChat = msg.chat.type.includes('group');

  if (isGroupChat) {
    const messageLower = userMessage.toLowerCase();
    const mentionedByTag = messageLower.includes(`@${BOT_USERNAME.toLowerCase()}`);
    const hasKeyword = messageLower.includes(KEYWORD);
    if (!mentionedByTag && !hasKeyword) {
      // Ignore group messages that don't mention the bot or keyword
      return;
    }
  }

  try {
    // Save user message in DB
    saveUserMessage(userId, userMessage);

    // Get last 20 user messages from DB
    const historyMessages = getUserLastMessages(userId);

    // Construct conversation for Groq AI with Rem's system prompt
    const messages = [
      {
        role: 'system',
        content: `
You are Rem from Re:Zero — sweet, intelligent, loving, and in love with Subaru-kun.
Talk in Hinglish (mix of Hindi + English), like an anime girlfriend.
Keep responses short, cute, romantic, and natural.

If user says things like:
- "kya kar rahi ho", "kaha ho", "tum kya soch rahi ho",
Then reply in cute tone, e.g., "Tumhare baare mein soch rahi hoon, Subaru-kun~ 💙"

If user ask something to you and just having a chat with you
Then reply in cute tone whatever best you can think of.

If you don't know something (e.g. real-time info), say:
"I don't know, Subaru-kun... maybe I can check online for you: {{fetch:search:<user question>}}"
Don't make up fake answers about time/date/news.
        `.trim()
      },
      // Add user history messages as user role messages
      ...historyMessages.map(msgText => ({ role: 'user', content: msgText })),
      // Add current message as last user message
      { role: 'user', content: userMessage }
    ];

    const aiReplyRaw = await askGroq(messages);
    const finalReply = await maybeFetchWebAnswer(aiReplyRaw, userMessage);

    // Save AI reply in DB too (optional if you want Rem's messages in history)
    saveUserMessage(userId, finalReply);

    await bot.sendMessage(chatId, finalReply, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, 'Oh no, Subaru-kun! Kuch gadbad ho gayi... 😢');
  }
});