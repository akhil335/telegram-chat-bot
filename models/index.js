import dotenv from 'dotenv';
dotenv.config();

export const modelSources = [
    {
      provider: 'groq',
      name: 'gemma2-9b-it',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    },
    {
      provider: 'groq',
      name: 'llama-3.1-8b-instant',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    },
    {
      provider: 'groq',
      name: 'deepseek-r1-distill-llama-70b',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    },
    {
      provider: 'groq',
      name: 'mistral-saba-24b',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    },
    {
      provider: 'groq',
      name: 'llama-3.3-70b-versatile',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    },
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