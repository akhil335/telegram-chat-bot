// musicHandler.js

import ytdl from 'ytdl-core';
import { exec } from 'child_process';
import fs from 'fs';
import { join } from 'path';
import { TgCalls, Stream } from 'pytgcalls'; // Make sure you have Python backend running
import { searchYouTube } from './utils/youtubeSearch.js'; // You can use yt-search or serpapi

const musicSessions = new Map();

const voice = new TgCalls({
  // Your config for PyTgCalls bridge (use python WebSocket bridge or similar)
});

export async function playMusic(bot, msg, songQuery) {
  const chatId = msg.chat.id;
  const reply = (text) => bot.sendMessage(chatId, text, {
    reply_to_message_id: msg.message_id
  });

  // 1. Check if VC is active
  const chat = await bot.getChat(chatId);
  if (!chat || !chat.has_active_voice_chat) {
    return reply('Voice chat is not active 😕\nPehle VC on karo fir Rem bajayegi!');
  }

  // 2. Search song on YouTube
  const result = await searchYouTube(songQuery);
  if (!result || !result.url) return reply('Song nahi mila 😓');

  const { url, title } = result;

  // 3. Download and convert audio using FFmpeg
  const audioPath = join('/tmp', `${Date.now()}_audio.raw`);
  const ffmpegCommand = `ffmpeg -i "$(youtube-dl -f bestaudio --get-url '${url}')" -f s16le -ac 2 -ar 48000 -acodec pcm_s16le ${audioPath}`;

  exec(ffmpegCommand, async (err) => {
    if (err) {
      console.error('FFmpeg error:', err);
      return reply('Audio convert nahi ho paya 😥');
    }

    // 4. Stream to VC using PyTgCalls
    try {
      const stream = Stream.local(audioPath);
      await voice.joinVoice(chatId, { stream });
      musicSessions.set(chatId, audioPath);
      reply(`Playing: *${title}*`, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Voice stream error:', e);
      reply('Stream karne mein error aa gaya 😭');
    }
  });
}

export function stopMusic(bot, chatId) {
  const audioPath = musicSessions.get(chatId);
  if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  musicSessions.delete(chatId);
  voice.leaveVoice(chatId);
} 

// In your main.js, you will use this like:
// if (msg.text?.startsWith('rem gana ')) {
//   const query = msg.text.replace('rem gana', '').trim();
//   playMusic(bot, msg, query);
// }
