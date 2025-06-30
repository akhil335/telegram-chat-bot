// textToSpeech.js
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateVoice(message, filename = 'output.ogg') {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;
  const headers = {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json'
  };

  const body = {
    text: message,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.9,
      style: 0.5
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error('Failed to fetch audio stream');

  const filePath = path.join(__dirname, filename);
  const dest = fs.createWriteStream(filePath);
  await new Promise((resolve, reject) => {
    response.body.pipe(dest);
    response.body.on('error', reject);
    dest.on('finish', resolve);
  });

  return filePath;
}
