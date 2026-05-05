import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set. Please add it to your .env file.');
  process.exit(1);
}

const systemPrompt = readFileSync(join(__dirname, 'system-prompt.txt'), 'utf-8').trim();
const knowledgeBase = readFileSync(join(__dirname, 'knowledge-base.txt'), 'utf-8').trim();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CACHE_FILE = join(__dirname, 'cache.json');
let cache = {};
try {
  cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`Cache loaded: ${Object.keys(cache).length} entries`);
} catch {
  console.log('No cache file found — starting fresh');
}

function saveCache() {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

async function generateWithRetry(question, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `${systemPrompt}\n\nCurated Knowledge Base:\n\n${knowledgeBase}\n\nYou MUST respond with valid JSON only, in this exact format: {"answer": "<your full answer>", "followup": "<one punchy follow-up question, max 8 words, curiosity-sparking>"}. No markdown, no extra text.`,
      generationConfig: { responseMimeType: 'application/json' },
    });
    try {
      return await model.generateContent(question);
    } catch (err) {
      const is503 = err?.status === 503 ||
                    err?.message?.includes('503') ||
                    err?.message?.toLowerCase().includes('service unavailable') ||
                    err?.message?.toLowerCase().includes('overloaded');
      if (is503 && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      throw err;
    }
  }
}

app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question?.trim()) {
    return res.status(400).json({ error: 'No question provided.' });
  }
  try {
    const key = question.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (cache[key]) {
      console.log('cache hit:', question.trim());
      return res.json(cache[key]);
    }
    console.log('api call:', question.trim());
    const result = await generateWithRetry(question.trim());
    const parsed = JSON.parse(result.response.text() || '{}');
    const payload = {
      answer: parsed.answer || 'No response received.',
      followup: parsed.followup || null,
    };
    cache[key] = payload;
    saveCache();
    res.json(payload);
  } catch (err) {
    console.error('Gemini API error:', err?.message ?? err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Shaivism app running at http://localhost:${PORT}`));
}

export default app;
