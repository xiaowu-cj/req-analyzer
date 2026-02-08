import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(__dirname, 'cases');

function ensureCasesDir() {
  if (!existsSync(CASES_DIR)) {
    mkdirSync(CASES_DIR, { recursive: true });
  }
}

function generateFilename(topic) {
  const date = new Date().toISOString().slice(0, 10);
  const safeTopic = topic.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);
  return `${date}_${safeTopic}.json`;
}

export function saveCase({ originalRequirement, messages, summary }) {
  ensureCasesDir();

  const topic = originalRequirement.slice(0, 30);
  const filename = generateFilename(topic);
  const filePath = join(CASES_DIR, filename);

  const caseData = {
    createdAt: new Date().toISOString(),
    originalRequirement,
    messages,
    summary,
    dimensionsCovered: extractCoveredDimensions(messages),
  };

  writeFileSync(filePath, JSON.stringify(caseData, null, 2), 'utf-8');
  return filename;
}

export function listCases() {
  ensureCasesDir();

  const files = readdirSync(CASES_DIR).filter(f => f.endsWith('.json'));
  return files.map(filename => {
    const filePath = join(CASES_DIR, filename);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return {
      filename,
      createdAt: data.createdAt,
      originalRequirement: data.originalRequirement,
      messageCount: data.messages.length,
    };
  });
}

export function loadCase(filename) {
  const filePath = join(CASES_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`案例文件不存在: ${filename}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function extractCoveredDimensions(messages) {
  const dimensionKeywords = {
    user_roles: '用户角色',
    business_background: '业务背景',
    business_process: '业务流程',
    transaction_scenarios: '交易场景',
    exception_scenarios: '异常场景',
    non_functional: '非功能需求',
    related_systems: '关联系统',
  };

  const covered = {};
  const assistantMessages = messages
    .filter(m => m.role === 'assistant')
    .map(m => typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => b.text).join(' '))
    .join(' ');

  for (const [id, keyword] of Object.entries(dimensionKeywords)) {
    covered[id] = assistantMessages.includes(keyword);
  }

  return covered;
}
