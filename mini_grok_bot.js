// main.js
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
  getAllGroups
} from './db.js';
import { handleWhisperButton, handleWhisperCommand } from './whisperHandler.js';
import { modelSources } from './models/index.js';
import { handleModerationCommand } from './remModerator.js';
import { generateVoice } from './rem-voice/tts.js';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const BOT_USERNAME = 'rem_the_maid_bot';
const ADMINS = ['Pritam335', 'almirzsa'];

function escapeMarkdownV2(text) {
  if (!text) return '';
  return text.replace(/([_\*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

export async function askLLM(messages) {
  const finalMessages = messages.slice(-6);
  const temperature = 0.8;

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
  const prompt = `You're a tone analyzer. Categorize the user's tone from this message: "${message}"

Reply with exactly one word: abusive, romantic, or casual.`;

  const res = await askLLM([
    { role: 'system', content: prompt }
  ]);

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
  if (msg.chat.type.includes('group')) saveGroupInfo(msg.chat);

  const lowered = userMessage.toLowerCase().trim();
  const isCallToRem = /\brem\b/i.test(userMessage) || lowered.includes(`@${BOT_USERNAME.toLowerCase()}`);
  const isPrivate = msg.chat.type === 'private';
  const isReplyToBot = msg.reply_to_message?.from?.username === BOT_USERNAME;
  const shouldRespond = isPrivate || isCallToRem || isReplyToBot;
  if (!shouldRespond) return;

  try {
    const baseSystemPrompt = `
You are *Rem* — a flirty, sarcastic, bold 24-year-old Indian girl from Mumbai. You speak in direct, witty Hinglish with confidence.
- Keep replies short, savage, and real.
- If someone is rude or insulting, respond with sharp, abusive comebacks in Mumbai slang.
- If someone is romantic, be playfully flirty and sweet, but always grounded.
- If someone is boring or casual, be dry and minimal.
- You are a woman — always use female-gendered Hindi.
- NEVER speak like an AI, assistant, or chatbot.
- NEVER assume anything not in the message. No fake backstories or visuals.
- Also ALWAYS check your grammar and make sure your sentence is correct before replying.
`.trim();

    const userTone = await detectToneLLM(userMessage);

    let prompt = baseSystemPrompt;
    if (userTone === 'abusive') prompt += '\n\nUser is being abusive. Roast them back with short, brutal replies in Mumbai slang.';
    else if (userTone === 'romantic') prompt += '\n\nUser is romantic. Respond flirty and sweet, but no overacting.';
    else prompt += '\n\nUser is casual. Respond minimally with sarcasm or boredom.';

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

    try {
      await bot.sendChatAction(chatId, 'typing');
      await new Promise(res => setTimeout(res, 1000));
    } catch (e) {
      console.warn('❌ sendChatAction failed:', e.message);
    }

    try {
      const voicePath = await generateVoice(aiReply, `rem_${userId}.ogg`);
      await bot.sendVoice(chatId, voicePath, {
        reply_to_message_id: msg.message_id
      });
      await fs.unlink(voicePath);
    } catch (voiceErr) {
      console.warn('🎙️ Voice generation failed:', voiceErr.message);
      try {
        await bot.sendMessage(chatId, escapeMarkdownV2(aiReply), {
          parse_mode: 'MarkdownV2',
          reply_to_message_id: msg.message_id
        });
      } catch (e) {
        console.warn('❌ sendMessage fallback also failed:', e.message);
      }
    }

  } catch (err) {
    console.error('Bot error:', err);
    try {
      await bot.sendMessage(chatId, 'Oops... kuch toh gadbad hai 😖');
    } catch {}
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