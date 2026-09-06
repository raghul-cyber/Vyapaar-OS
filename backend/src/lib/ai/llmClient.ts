import { fallbackNarrative } from './fallbackTemplates';

function extractInputNumbers(obj: any, allowed: Set<string>) {
  if (typeof obj === 'number') {
    allowed.add(obj.toString());
  } else if (Array.isArray(obj)) {
    obj.forEach(item => extractInputNumbers(item, allowed));
  } else if (obj !== null && typeof obj === 'object') {
    Object.values(obj).forEach(val => extractInputNumbers(val, allowed));
  }
}

function validateNumbers(text: string, inputData: any): boolean {
  // Extract all numbers from LLM text (allowing decimals but capturing the clean numeric string)
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return true;
  
  const allowedNumbers = new Set<string>();
  extractInputNumbers(inputData, allowedNumbers);
  
  for (const match of matches) {
    const num = parseFloat(match).toString(); // normalize 
    if (!allowedNumbers.has(num)) {
      console.warn(`[AI Validation] Rejecting LLM output due to hallucinated number: ${num}`);
      return false;
    }
  }
  return true;
}

export async function generateNarrative(
  contextType: 'whatIf' | 'creditScore' | 'dashboard',
  inputData: any
): Promise<{ narrative: string, narrativeSource: 'llm' | 'template' }> {
  const fallback = { narrative: fallbackNarrative(contextType, inputData), narrativeSource: 'template' as const };
  
  if (process.env.LLM_PROVIDER === 'none' || !process.env.OLLAMA_BASE_URL) {
    return fallback;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const prompt = `Context: ${contextType}\nData: ${JSON.stringify(inputData)}\nGenerate a brief executive summary. DO NOT hallucinate numbers.`;
    
    const res = await fetch(`${process.env.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: process.env.OLLAMA_MODEL || 'llama3', 
        prompt, 
        stream: false 
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`Ollama API returned ${res.status}`);
    const data = await res.json();
    const llmText = data.response || '';
    
    if (validateNumbers(llmText, inputData)) {
      return { narrative: llmText.trim(), narrativeSource: 'llm' };
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    console.warn(`[AI Fallback Triggered] ${e.message}`);
  }
  
  return fallback;
}
