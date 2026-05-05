import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
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

async function generateWithRetry(question, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `${systemPrompt}\n\nCurated Knowledge Base:\n\n${knowledgeBase}`,
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
    const result = await generateWithRetry(question.trim());
    const text = result.response.text() || 'No response received.';
    res.json({ answer: text });
  } catch (err) {
    console.error('Gemini API error:', err?.message ?? err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.post('/followups', async (req, res) => {
  const { question, answer } = req.body;
  if (!question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'Missing question or answer.' });
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `A seeker asked about Kashmir Shaivism: "${question.trim()}"\n\nThe teacher responded: "${answer.trim()}"\n\nSuggest exactly 3 follow-up questions a curious seeker might naturally ask next, deepening this exploration of Kashmir Shaivism. Each question should feel like a genuine next step — not generic, but specific to what was just discussed. Return only a valid JSON array of 3 short question strings. No markdown, no explanation, just the JSON array.`;
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const followups = JSON.parse(text);
    if (!Array.isArray(followups) || followups.length === 0) throw new Error('Invalid response format');
    res.json({ followups: followups.slice(0, 3) });
  } catch (err) {
    console.error('Follow-up error:', err?.message ?? err);
    res.status(500).json({ error: 'Could not generate follow-up questions.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shaivism app running at http://localhost:${PORT}`));
