import 'dotenv/config';
import { createInterface } from 'readline';
import { Analyzer } from './analyzer.js';
import { saveCase, listCases, loadCase } from './storage.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function parseImagePaths(input) {
  const imgRegex = /\/img\s+(\S+)/g;
  const images = [];
  let match;
  while ((match = imgRegex.exec(input)) !== null) {
    images.push(match[1]);
  }
  const text = input.replace(/\/img\s+\S+/g, '').trim();
  return { text, images };
}

function printCaseList() {
  const cases = listCases();
  if (cases.length === 0) {
    console.log('\n暂无历史案例。\n');
    return;
  }
  console.log('\n=== 历史案例 ===\n');
  for (const c of cases) {
    console.log(`📄 ${c.filename}`);
    console.log(`   需求: ${c.originalRequirement}`);
    console.log(`   对话轮数: ${Math.floor(c.messageCount / 2)}`);
    console.log(`   时间: ${c.createdAt}`);
    console.log('');
  }
}

function printCaseDetail(filename) {
  try {
    const data = loadCase(filename);
    console.log(`\n=== 案例详情: ${filename} ===\n`);
    console.log(`原始需求: ${data.originalRequirement}`);
    console.log(`创建时间: ${data.createdAt}\n`);

    console.log('--- 对话记录 ---\n');
    for (const msg of data.messages) {
      const role = msg.role === 'user' ? '甲方' : '机器人';
      let display;
      if (typeof msg.content === 'string') {
        display = msg.content;
      } else {
        const parts = [];
        for (const block of msg.content) {
          if (block.type === 'text') parts.push(block.text);
          else if (block.type === 'image') parts.push('[图片]');
        }
        display = parts.join(' ');
      }
      console.log(`[${role}]: ${display}\n`);
    }

    if (data.summary) {
      console.log('--- 需求摘要 ---\n');
      console.log(data.summary);
    }

    console.log('\n--- 维度覆盖 ---\n');
    if (data.dimensionsCovered) {
      for (const [dim, covered] of Object.entries(data.dimensionsCovered)) {
        console.log(`  ${covered ? '✅' : '❌'} ${dim}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(`错误: ${err.message}`);
  }
}

async function startAnalysis() {
  console.log('\n🤖 启动需求分析机器人...');
  console.log('（输入"完成"结束分析并生成摘要，输入"退出"直接退出）');
  console.log('（发送图片: /img 图片路径，可同时发送文字和多张图片）\n');

  const initialInput = await prompt('请输入甲方的需求描述：\n> ');

  if (!initialInput.trim()) {
    console.log('需求不能为空，退出。');
    rl.close();
    return;
  }

  const analyzer = new Analyzer();

  const { text: initText, images: initImages } = parseImagePaths(initialInput);

  console.log('\n分析中...\n');
  try {
    const firstResponse = await analyzer.analyze(initText, initImages);
    console.log(`机器人: ${firstResponse}\n`);
  } catch (err) {
    console.error(`错误: ${err.message}\n`);
  }

  while (true) {
    const userInput = await prompt('> ');
    const trimmed = userInput.trim();

    if (trimmed === '退出') {
      console.log('\n已退出，对话未保存。');
      break;
    }

    if (trimmed === '完成') {
      console.log('\n正在生成需求分析摘要...\n');
      const summary = await analyzer.generateSummary();
      console.log(summary);

      const { originalRequirement, messages } = analyzer.getConversationData();
      const filename = saveCase({ originalRequirement, messages, summary });
      console.log(`\n✅ 案例已保存到: cases/${filename}\n`);
      break;
    }

    if (!trimmed) continue;

    const { text, images } = parseImagePaths(trimmed);

    if (!text && images.length === 0) continue;

    console.log('\n分析中...\n');
    try {
      const response = await analyzer.analyze(text, images);
      console.log(`机器人: ${response}\n`);
    } catch (err) {
      console.error(`错误: ${err.message}\n`);
    }
  }

  rl.close();
}

// CLI 入口
const args = process.argv.slice(2);

if (args[0] === '--list') {
  printCaseList();
  process.exit(0);
} else if (args[0] === '--review' && args[1]) {
  printCaseDetail(args[1]);
  process.exit(0);
} else {
  startAnalysis().catch(err => {
    console.error('发生错误:', err.message);
    rl.close();
    process.exit(1);
  });
}
