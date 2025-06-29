import dotenv from 'dotenv';
dotenv.config();

export const modelSources = [
  // 🌟 Best Overall — Flirty + Fast + Smart
  {
    provider: 'groq',
    name: 'llama-3.3-70b-versatile',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // 💬 Good vibes but may leak <think> sometimes
  {
    provider: 'groq',
    name: 'mistral-saba-24b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // ⚡ Super fast & decent — fallback option
  {
    provider: 'groq',
    name: 'llama-3.1-8b-instant',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // 🧪 Optional fallback — less emotional depth
  {
    provider: 'groq',
    name: 'gemma2-9b-it',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // 🚨 Experimental — often leaks <think> or overthinks (use last)
  {
    provider: 'groq',
    name: 'deepseek-r1-distill-llama-70b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // 🧪 Compound series — mixed results
  {
    provider: 'groq',
    name: 'compound-beta',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },
  {
    provider: 'groq',
    name: 'compound-beta-mini',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  },

  // 🔄 OpenRouter backups (use after Groq)
  {
    provider: 'openrouter',
    name: 'mistralai/mistral-small-3.2-24b-instruct:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.OPEN_ROUTER_API}`,
      'Content-Type': 'application/json'
    }
  },
  {
    provider: 'openrouter',
    name: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.OPEN_ROUTER_API}`,
      'Content-Type': 'application/json'
    }
  },
  {
    provider: 'openrouter',
    name: 'deepseek/deepseek-r1-0528:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.OPEN_ROUTER_API}`,
      'Content-Type': 'application/json'
    }
  },
  {
    provider: 'openrouter',
    name: 'google/gemma-3n-e4b-it:free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${process.env.OPEN_ROUTER_API}`,
      'Content-Type': 'application/json'
    }
  }
];
