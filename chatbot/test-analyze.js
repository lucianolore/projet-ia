// Standalone test for analyzeData() - feeds it realistic "already displayed"
// data (as if the frontend had just rendered a tax comparison table) and
// prints Claude's interpretation. Verifies the fiscal-analysis skill is
// actually influencing the output (glossary/caveats/format from SKILL.md).

const { analyzeData } = require('./analyze');
const { buildExecutor } = require('./bootstrap');

async function main() {
  const executor = buildExecutor();

  // Simulates data the frontend already fetched and displayed (e.g. via
  // taxes:compare_taxes) - analyzeData should interpret it, not re-fetch it.
  const displayedData = {
    dispositif_fiscal: 'FB',
    categorie: 'Taux',
    annee: '2025',
    comparison: [
      { commune: 'BORDEAUX', idcom: '33063', taux: 48.48 },
      { commune: 'BRUGES', idcom: '33075', taux: 49.79 },
      { commune: 'MERIGNAC', idcom: '33281', taux: 46.18 },
    ],
  };

  const { finalText } = await analyzeData(
    { data: displayedData, question: 'Que dire de ce classement pour quelqu\'un qui cherche à s\'implanter dans la métropole bordelaise ?' },
    executor,
  );

  console.log('\n=== ANALYSE FINALE ===\n');
  console.log(finalText);
}

main().catch(console.error);
