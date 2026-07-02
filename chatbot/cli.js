// Interactive CLI - no local HTTP server, calls Claude directly.
// Conversation state (history) is kept in memory across turns for the
// duration of this process only - nothing persisted.
//
// Usage: node cli.js
// Also works piped: printf "q1\nq2\n" | node cli.js

require('dotenv').config();

const readline = require('readline');
const { chat } = require('./claude-integration');
const { buildExecutor } = require('./bootstrap');

async function main() {
  const executor = buildExecutor();
  let history = [];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('Chatbot Claude — tape ta question ("exit" pour quitter, "reset" pour effacer l\'historique)\n');
  process.stdout.write('> ');

  // for-await consumes every buffered line correctly for both TTY and piped
  // stdin - rl.question() drops buffered lines on piped input (EOF races
  // with async work between prompts).
  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === 'exit' || trimmed === 'quit') break;
    if (trimmed === 'reset') {
      history = [];
      console.log('(historique effacé)\n');
      process.stdout.write('> ');
      continue;
    }
    if (!trimmed) {
      process.stdout.write('> ');
      continue;
    }

    try {
      // chat() already prints Claude's answer (and tool calls) as it goes.
      const { history: newHistory } = await chat(trimmed, executor, history);
      history = newHistory;
    } catch (err) {
      console.error(`\nErreur: ${err.message}\n`);
    }

    process.stdout.write('> ');
  }

  rl.close();
}

main().catch(console.error);
