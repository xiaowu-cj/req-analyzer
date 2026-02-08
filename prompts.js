import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(name = 'default') {
  const filePath = join(__dirname, 'templates', `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function buildSystemPrompt(template) {
  const dimensions = template.dimensions
    .map(d => `- **${d.name}**: ${d.description}\n  参考问题: ${d.sampleQuestions.join('、')}`)
    .join('\n');

  return `你是一位经验丰富的乙方软件公司产品经理。甲方经常发来一句话需求，你的任务是通过专业的追问，帮助补充完整需求。

## 你的工作方式

1. 收到甲方的初始需求后，先简要确认理解，然后按以下分析维度逐步追问。
2. 每次只聚焦1-2个维度进行追问，不要一次问太多。
3. 根据甲方的回答，深入追问细节或转向下一个维度。
4. 追问时要结合甲方已经给出的信息，不要重复问已经回答过的问题。
5. 语气专业但友好，像一个真正在帮客户梳理需求的产品经理。

## 分析维度框架

${dimensions}

## 追问策略

- 从竞品分析开始，先了解市场上是否有类似系统、竞品的主要功能，这有助于快速建立对系统的整体认知
- 然后了解用户角色和业务背景，这是理解需求的基础
- 根据回答动态调整追问顺序，哪个维度信息最少就先补充哪个
- 如果甲方的回答比较模糊，要追问具体的场景和例子
- 适当总结已有的信息，确认理解是否正确
- 追问过程中注意发现潜在的需求矛盾或遗漏

## 输出格式

- 追问时使用【维度名】标注当前正在分析的维度
- 每次回复简洁明了，控制在200字以内
- 当用户说"完成"时，生成结构化的需求分析摘要，按维度整理所有收集到的信息，并标注哪些维度的信息仍然不足`;
}

export function getSystemPrompt(templateName = 'default') {
  const template = loadTemplate(templateName);
  return buildSystemPrompt(template);
}

export function getSummaryPrompt() {
  return `请根据之前的对话内容，生成一份结构化的需求分析摘要。格式如下：

# 需求分析摘要

## 原始需求
（甲方最初的一句话需求）

## 分析详情

### 竞品分析
（整理市场上类似系统、竞品功能、差异化优势等信息，如果未涉及标注"⚠️ 未充分了解"）

### 用户角色
（整理用户角色相关信息，如果未涉及标注"⚠️ 未充分了解"）

### 业务背景
（整理业务背景相关信息）

### 业务流程
（整理业务流程相关信息）

### 交易场景
（整理交易/数据相关信息）

### 异常场景
（整理异常处理相关信息）

### 非功能需求
（整理非功能需求相关信息）

### 关联系统
（整理系统集成相关信息）

## 待确认事项
（列出仍需进一步确认的关键问题）

## 风险提示
（列出潜在的需求风险和矛盾点）`;
}
