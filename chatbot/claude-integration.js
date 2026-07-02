// Claude API integration: agentic tool_use loop over the executor.
// Requires: ANTHROPIC_API_KEY env var. Consumed by cli.js.

require('dotenv').config();

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const TOOL_DEFINITIONS = require('./tool-definitions.json');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// === System Prompt ===

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf-8');

// Anthropic tool names must match ^[a-zA-Z0-9_-]{1,128}$ - no ':'. Map "source:tool" <-> "source__tool".
const ANTHROPIC_TOOLS = TOOL_DEFINITIONS.map((tool) => ({
  name: tool.name.replace(':', '__'),
  description: tool.description,
  input_schema: tool.input_schema,
}));

function toRealToolName(anthropicName) {
  return anthropicName.replace('__', ':');
}

class ToolExecutorForClaude {
  constructor(executor) {
    this.executor = executor;
  }

  async execute(toolName, toolInput) {
    // Dispatch to our executor
    const result = await this.executor.execute(toRealToolName(toolName), toolInput);
    // Claude expects result as string or JSON
    return JSON.stringify(result, null, 2);
  }
}

// === Main Chat Loop ===

async function chat(userMessage, executor, priorHistory = [], extraSystemPrompt = '') {
  const toolExecutor = new ToolExecutorForClaude(executor);
  const messages = [...priorHistory, { role: 'user', content: userMessage }];
  const system = extraSystemPrompt ? `${SYSTEM_PROMPT}\n\n${extraSystemPrompt}` : SYSTEM_PROMPT;

  console.log(`\n📝 User: ${userMessage}\n`);

  // Agentic loop: Claude calls tools, we execute, loop until no more tool calls
  let loopCount = 0;
  const maxLoops = 10;

  while (loopCount < maxLoops) {
    loopCount++;
    console.log(`[Loop ${loopCount}]`);

    // Call Claude with tools
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      tools: ANTHROPIC_TOOLS,
      messages,
    });

    console.log(`Stop reason: ${response.stop_reason}`);

    // Collect Claude's response blocks
    let hasToolUse = false;
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`\n🤖 Claude: ${block.text}\n`);
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        const toolName = toRealToolName(block.name);
        const toolInput = block.input;

        console.log(`\n⚙️  Tool call: ${toolName}`);
        console.log(`   Input: ${JSON.stringify(toolInput, null, 2)}`);

        try {
          const result = await toolExecutor.execute(toolName, toolInput);
          console.log(`   Result: ${result.substring(0, 200)}...`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        } catch (err) {
          console.error(`   Error: ${err.message}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: err.message }),
            is_error: true,
          });
        }
      }
    }

    // Add Claude's response to messages
    messages.push({ role: 'assistant', content: response.content });

    // If no tool calls, Claude is done
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      console.log('\n✅ Chat complete');
      break;
    }

    // Add tool results and continue loop
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (loopCount >= maxLoops) {
    console.log('\n⚠️  Max loops reached');
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const finalText = (lastAssistant?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { finalText, history: messages };
}

module.exports = { chat };
