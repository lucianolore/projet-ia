// Example: Direct Claude API call with tool_use
// This shows how to call Claude and handle tool calls

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

require('dotenv').config();

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load tool definitions
const TOOLS = JSON.parse(fs.readFileSync('./tool-definitions.json', 'utf-8'));

const SYSTEM_PROMPT = fs.readFileSync('./system-prompt.md', 'utf-8');

// Example: Simple direct call
async function exampleSimpleCall() {
  console.log('=== Example 1: Simple Call (No Tools) ===\n');

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: 'You are a helpful real estate expert.',
    messages: [
      {
        role: 'user',
        content: 'What are the main factors to consider when choosing a commercial real estate location?',
      },
    ],
  });

  console.log(response.content[0].text);
  console.log('\n---\n');
}

// Example: Call with tools (but don't actually execute them)
async function exampleToolDefinition() {
  console.log('=== Example 2: Tool Definition (Single Call) ===\n');

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS.slice(0, 3), // First 3 tools as example
    messages: [
      {
        role: 'user',
        content: 'What tools do you have for real estate analysis?',
      },
    ],
  });

  console.log('Stop reason:', response.stop_reason);
  for (const block of response.content) {
    if (block.type === 'text') {
      console.log('Text:', block.text);
    } else if (block.type === 'tool_use') {
      console.log(`Tool call: ${block.name}`);
      console.log('Input:', JSON.stringify(block.input, null, 2));
    }
  }
  console.log('\n---\n');
}

// Example: Agentic loop (the real pattern) - uses the real executor, not a mock
async function exampleAgenticLoop() {
  console.log('=== Example 3: Agentic Loop ===\n');

  const { buildExecutor } = require('./bootstrap');
  const executor = buildExecutor();

  const userQuery = 'Compare property tax rates (FB) for Bordeaux vs Bruges in 2025. Which is cheaper?';
  console.log(`User: ${userQuery}\n`);

  const messages = [{ role: 'user', content: userQuery }];

  for (let i = 0; i < 5; i++) {
    // Call Claude
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    console.log(`[Loop ${i + 1}] Stop reason: ${response.stop_reason}`);

    // Process response
    let hasToolUse = false;
    for (const block of response.content) {
      if (block.type === 'text') {
        console.log(`Claude: ${block.text.substring(0, 200)}...`);
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        console.log(`  → Tool: ${block.name}`);
        console.log(`    Args: ${JSON.stringify(block.input).substring(0, 100)}...`);
      }
    }

    // Add assistant response to messages
    messages.push({ role: 'assistant', content: response.content });

    // Stop if no tool calls or end_turn
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      console.log('\n✅ Done\n');
      break;
    }

    // Real tool execution via the shared executor
    const toolResults = await Promise.all(
      response.content
        .filter((b) => b.type === 'tool_use')
        .map(async (b) => {
          try {
            const result = await executor.execute(b.name, b.input);
            return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) };
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: b.id,
              content: JSON.stringify({ error: err.message }),
              is_error: true,
            };
          }
        }),
    );

    // Add tool results to messages
    messages.push({ role: 'user', content: toolResults });
  }
}

// Example: Streaming (real-time response)
async function exampleStreaming() {
  console.log('=== Example 4: Streaming Response ===\n');

  const stream = await client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: 'You are a real estate expert. Be concise.',
    messages: [
      {
        role: 'user',
        content: 'Briefly explain commercial real estate valuation.',
      },
    ],
  });

  // Consume stream
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
    }
  }

  console.log('\n\n---\n');
}

// Main
async function main() {
  try {
    await exampleSimpleCall();
    await exampleToolDefinition();
    await exampleAgenticLoop();
    await exampleStreaming();
  } catch (err) {
    console.error('Error:', err.message);
    if (err.status === 401) {
      console.error('API key invalid. Set ANTHROPIC_API_KEY env var.');
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { exampleSimpleCall, exampleAgenticLoop, exampleStreaming };
