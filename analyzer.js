import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import { extname, resolve } from 'path';
import { getSystemPrompt, getSummaryPrompt } from './prompts.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
});

const SUPPORTED_IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function loadImageAsBase64(filePath) {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`图片文件不存在: ${resolved}`);
  }
  const ext = extname(resolved).toLowerCase();
  const mediaType = SUPPORTED_IMAGE_TYPES[ext];
  if (!mediaType) {
    throw new Error(`不支持的图片格式: ${ext}（支持 jpg/png/gif/webp）`);
  }
  const data = readFileSync(resolved).toString('base64');
  return { mediaType, data };
}

export class Analyzer {
  constructor(templateName = 'default') {
    this.systemPrompt = getSystemPrompt(templateName);
    this.messages = [];
    this.originalRequirement = '';
  }

  async analyze(userInput, imagePaths = [], imageDataList = [], fileDataList = []) {
    if (!this.originalRequirement) {
      this.originalRequirement = typeof userInput === 'string' ? userInput : '(含图片/文件的需求)';
    }

    // Build content blocks
    const content = [];
    // Support file paths (CLI)
    for (const imgPath of imagePaths) {
      const { mediaType, data } = loadImageAsBase64(imgPath);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data },
      });
    }
    // Support base64 data directly (Web)
    for (const img of imageDataList) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      });
    }
    // Support file uploads (PDF as document, Office docs as extracted text)
    for (const file of fileDataList) {
      if (file.mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.data },
        });
      } else if (file.extractedText) {
        content.push({
          type: 'text',
          text: `【文件: ${file.name}】\n${file.extractedText}`,
        });
      }
    }
    if (userInput) {
      content.push({ type: 'text', text: userInput });
    }

    this.messages.push({ role: 'user', content });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: this.systemPrompt,
      messages: this.messages,
    });

    const assistantMessage = response.content[0].text;
    this.messages.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  }

  async generateSummary() {
    this.messages.push({ role: 'user', content: getSummaryPrompt() });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: this.systemPrompt,
      messages: this.messages,
    });

    const summary = response.content[0].text;
    this.messages.push({ role: 'assistant', content: summary });

    return summary;
  }

  getConversationData() {
    return {
      originalRequirement: this.originalRequirement,
      messages: this.messages,
    };
  }
}
