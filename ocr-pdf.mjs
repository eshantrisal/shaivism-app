import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJpegs(buffer) {
  const jpegs = [];
  let i = 0;
  while (i < buffer.length - 2) {
    if (buffer[i] === 0xFF && buffer[i+1] === 0xD8 && buffer[i+2] === 0xFF) {
      const start = i;
      // Find the matching FF D9 end marker
      let j = i + 2;
      while (j < buffer.length - 1) {
        if (buffer[j] === 0xFF && buffer[j+1] === 0xD9) {
          const end = j + 2;
          const jpg = buffer.slice(start, end);
          // Only keep images larger than 5KB (skip thumbnails/tiny images)
          if (jpg.length > 5000) {
            jpegs.push(jpg);
          }
          i = end;
          break;
        }
        j++;
      }
      if (j >= buffer.length - 1) break;
    } else {
      i++;
    }
  }
  return jpegs;
}

async function ocrImage(jpegBuffer) {
  const base64 = jpegBuffer.toString('base64');
  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
        },
        {
          type: 'text',
          text: 'Transcribe all the text visible in this image exactly as written. Output only the transcribed text with no commentary or explanation.',
        },
      ],
    }],
  });
  return msg.content.find(b => b.type === 'text')?.text ?? '';
}

async function processPDF(filePath, label) {
  const absPath = resolve(filePath);
  const buffer = readFileSync(absPath);
  const jpegs = extractJpegs(buffer);

  console.log(`\n📄 ${label}`);
  console.log(`   Found ${jpegs.length} page images`);

  let fullText = `\n\n${'='.repeat(70)}\nSource: ${label}\n${'='.repeat(70)}\n`;

  for (let i = 0; i < jpegs.length; i++) {
    process.stdout.write(`  Page ${i+1}/${jpegs.length}... `);
    try {
      const text = await ocrImage(jpegs[i]);
      fullText += `\n-- Page ${i+1} --\n${text}\n`;
      console.log('done');
    } catch (err) {
      console.log(`error: ${err.message}`);
      fullText += `\n-- Page ${i+1} --\n[OCR failed]\n`;
    }
  }

  return fullText;
}

const pdfs = [
  {
    path: '/Users/eshantrisal/Downloads/Talks With Shaivacharya Swami Lakshmanjoo By Shaivacharya Swami Lakshmanjoo Kashmir Shaivism Illustrated New Delhi 2026 - Ishwar Ashram Trust.pdf',
    label: 'Talks With Shaivacharya Swami Lakshmanjoo (Ishwar Ashram Trust, 2026)',
  },
  {
    path: '/Users/eshantrisal/Downloads/History-of-Kashmir-Shaivism-B-N-Pandit.pdf',
    label: 'History of Kashmir Shaivism — B.N. Pandit',
  },
];

for (const { path, label } of pdfs) {
  const text = await processPDF(path, label);
  appendFileSync('/Users/eshantrisal/kashmir-shaivism-app/knowledge-base.txt', text);
  console.log(`\n✅ Appended: ${label}`);
}

console.log('\n✅ All done — knowledge-base.txt updated.');
