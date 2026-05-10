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

// Pre-split knowledge base into paragraphs once at startup
const KB_CHUNKS = knowledgeBase.split(/\n{2,}/).filter(c => c.trim().length > 40);
console.log(`Knowledge base loaded: ${KB_CHUNKS.length} chunks`);

const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should','may','might',
  'shall','can','to','of','in','on','at','by','for','with','about','as','into','from',
  'and','or','but','not','what','who','how','when','where','why','which','this','that',
  'these','those','it','its','i','me','my','you','your','we','our','they','their',
  'tell','explain','describe','give','know','understand','mean','means','please',
]);

function extractRelevantContext(question, wordLimit = 800) {
  const words = question.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
  const keywords = words.filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // No meaningful keywords — return the opening passages
  if (keywords.length === 0) {
    return KB_CHUNKS.slice(0, 8).join('\n\n').split(/\s+/).slice(0, wordLimit).join(' ');
  }

  const scored = KB_CHUNKS.map(chunk => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      score += (lower.match(re) || []).length;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let totalWords = 0;
  const selected = [];
  for (const { chunk, score } of scored) {
    if (score === 0) break;
    const chunkWords = chunk.split(/\s+/).length;
    if (totalWords + chunkWords > wordLimit) break;
    selected.push(chunk);
    totalWords += chunkWords;
  }

  if (selected.length === 0) {
    return KB_CHUNKS.slice(0, 8).join('\n\n').split(/\s+/).slice(0, wordLimit).join(' ');
  }

  return selected.join('\n\n');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Single model instance — initialized once at startup
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: `${systemPrompt}\n\nYou MUST respond with valid JSON only, in this exact format: {"answer": "<your full answer>", "followup": "<one punchy follow-up question, max 8 words, curiosity-sparking>"}. No markdown, no extra text.`,
  generationConfig: { responseMimeType: 'application/json' },
});

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

// Warmup ping — primes the connection so the first real request doesn't cold-start
(async () => {
  try {
    console.log('Warming up Gemini model…');
    await model.generateContent('ready');
    console.log('Model ready.');
  } catch (err) {
    console.warn('Warmup ping failed (non-fatal):', err?.message);
  }
})();

async function generateWithRetry(question, retries = 3) {
  const context = extractRelevantContext(question);
  const prompt = `Relevant context from Kashmir Shaivism texts:\n\n${context}\n\nQuestion: ${question}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await model.generateContent(prompt);
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
