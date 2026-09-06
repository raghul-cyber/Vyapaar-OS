import { generateNarrative } from './src/lib/ai/llmClient';

async function runTests() {
  console.log('--- Test 1: Fallback (LLM_PROVIDER=none) ---');
  process.env.LLM_PROVIDER = 'none';
  const res1 = await generateNarrative('whatIf', { currentRunwayDays: 50, scenarioRunwayDays: 30, cashImpact: 1000 });
  console.log('Narrative:', res1.narrative);
  console.log('Source:', res1.narrativeSource);

  console.log('\n--- Test 2: Timeout (Unreachable Host) ---');
  process.env.LLM_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = 'http://10.255.255.1:9999'; // Dead IP
  const start = Date.now();
  const res2 = await generateNarrative('whatIf', { currentRunwayDays: 50 });
  const duration = Date.now() - start;
  console.log(`Timeout fired in ${duration}ms (Expected ~5000ms)`);
  console.log('Source after timeout:', res2.narrativeSource);

  console.log('\n--- Test 3: Number Validation Rejection ---');
  // We will mock global.fetch to return a hallucinatory response
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    return {
      ok: true,
      json: async () => ({
        response: 'Your runway dropped because of a 99999 rupee impact!' // 99999 is NOT in input
      })
    } as any;
  };
  
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  const res3 = await generateNarrative('whatIf', { currentRunwayDays: 50, scenarioRunwayDays: 30, cashImpact: 1000 });
  console.log('LLM generated number 99999 which is not in input {50, 30, 1000}.');
  console.log('Source after validation rejection:', res3.narrativeSource);
  
  // Now mock valid fetch
  global.fetch = async (url, options) => {
    return {
      ok: true,
      json: async () => ({
        response: 'Your runway dropped from 50 to 30 days.' // Only numbers present in input
      })
    } as any;
  };
  const res4 = await generateNarrative('whatIf', { currentRunwayDays: 50, scenarioRunwayDays: 30, cashImpact: 1000 });
  console.log('LLM generated valid numbers {50, 30}.');
  console.log('Source after valid generation:', res4.narrativeSource);

  global.fetch = originalFetch;
}

runTests().catch(console.error);
