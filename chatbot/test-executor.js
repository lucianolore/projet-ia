// Test/demo: executor + adapters without Claude
// Shows tool execution flow

require('dotenv').config();

const { buildExecutor } = require('./bootstrap');

async function demo() {
  console.log('=== Real Estate Chatbot Executor Demo ===\n');

  // Setup (taxes:* hits the live OFGL REI API; datagouv:* calls the remote data.gouv.fr MCP server)
  const executor = buildExecutor();

  // Demo 1: Lookup real property tax rate for Bordeaux
  console.log('📍 Demo 1: Lookup FB (taxe foncière) rate for Bordeaux, 2025\n');
  try {
    const result = await executor.execute('taxes:lookup_local_taxes', {
      commune: 'Bordeaux',
      annee: '2025',
      dispositif_fiscal: 'FB',
      categorie: 'Taux',
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }

  console.log('\n---\n');

  // Demo 2: Compare FB rate across Bordeaux metro communes
  console.log('📍 Demo 2: Compare FB (taxe foncière) rate across Bordeaux metro\n');
  try {
    const result = await executor.execute('taxes:compare_taxes', {
      communes: ['Bordeaux', 'Bruges', 'Merignac'],
      dep: '33',
      annee: '2025',
      dispositif_fiscal: 'FB',
      categorie: 'Taux',
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }

  console.log('\n---\n');

  // Demo 3: Show available tools
  console.log('📍 Available Tools:\n');
  console.log(
    executor.toolRegistry
      .map(
        (t) => `  - ${t.name}\n    ${t.description}`,
      )
      .join('\n\n'),
  );

  console.log('\n---\n');

  // Demo 4: Adapter methods
  console.log('📍 Adapter Methods:\n');
  const datagouv = executor.adapters.get('datagouv');
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(datagouv))
    .filter((m) => m.startsWith('tool_'))
    .map((m) => `  - ${m.replace('tool_', 'datagouv:')}`);
  console.log('Datagouv tools:\n' + methods.join('\n'));

  const taxes = executor.adapters.get('taxes');
  const taxMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(taxes))
    .filter((m) => m.startsWith('tool_'))
    .map((m) => `  - ${m.replace('tool_', 'taxes:')}`);
  console.log('\nTax tools:\n' + taxMethods.join('\n'));

  console.log('\n=== End Demo ===');
}

demo().catch(console.error);
