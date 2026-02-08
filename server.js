import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, mkdirSync } from 'fs';
import officeparser from 'officeparser';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { Analyzer } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

// Chat log
const logDir = join(__dirname, 'logs');
mkdirSync(logDir, { recursive: true });

function logChat(sessionId, role, text, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    sessionId,
    role,
    text,
    ...meta,
  };
  const logFile = join(logDir, `${sessionId}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

// Session store: simple in-memory map
const sessions = new Map();

function getAnalyzer(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Analyzer());
  }
  return sessions.get(sessionId);
}

const OFFICE_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',       // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',              // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',      // pptx
  'application/msword',                                                              // doc
  'application/vnd.ms-excel',                                                        // xls
  'application/vnd.ms-powerpoint',                                                   // ppt
];

async function extractOfficeText(base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  const text = await officeparser.parseOfficeAsync(buffer);
  return text;
}

// POST /api/chat - send message with optional images and files
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, images, files } = req.body;
    const sid = sessionId || 'default';
    const analyzer = getAnalyzer(sid);

    // images: [{ mediaType: "image/png", data: "base64..." }]
    const imageDataList = Array.isArray(images) ? images : [];

    // files: [{ name, mediaType, data(base64) }]
    const fileDataList = [];
    if (Array.isArray(files)) {
      for (const file of files) {
        if (file.mediaType === 'application/pdf') {
          fileDataList.push({ name: file.name, mediaType: file.mediaType, data: file.data });
        } else if (OFFICE_TYPES.includes(file.mediaType)) {
          const extractedText = await extractOfficeText(file.data);
          fileDataList.push({ name: file.name, mediaType: file.mediaType, extractedText });
        }
      }
    }

    // Log user message
    logChat(sid, 'user', message || '', {
      imageCount: imageDataList.length,
      files: fileDataList.map(f => ({ name: f.name, mediaType: f.mediaType })),
    });

    const reply = await analyzer.analyze(message || '', [], imageDataList, fileDataList);

    // Log assistant reply
    logChat(sid, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/summary - generate requirement summary
app.post('/api/summary', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const sid = sessionId || 'default';
    const analyzer = getAnalyzer(sid);

    const summary = await analyzer.generateSummary();
    logChat(sid, 'summary', summary);
    res.json({ summary });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reset - reset conversation
app.post('/api/reset', async (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  logChat(sid, 'system', 'reset');
  sessions.delete(sid);
  res.json({ ok: true });
});

// POST /api/export-summary - export summary as Word document
app.post('/api/export-summary', async (req, res) => {
  try {
    const { sessionId, summary } = req.body;
    if (!summary) {
      return res.status(400).json({ error: '摘要内容为空' });
    }

    const paragraphs = summary.split(/\n/).map(line => {
      if (line.trim() === '') {
        return new Paragraph({ text: '' });
      }
      return new Paragraph({
        children: [new TextRun({ text: line })],
      });
    });

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            text: '需求分析摘要',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({ text: '' }),
          ...paragraphs,
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const sid = sessionId || 'default';
    logChat(sid, 'system', 'exported summary to docx');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="summary-${sid}.docx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`需求分析机器人 Web 服务已启动: http://localhost:${PORT}`);
});
