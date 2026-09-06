async function run() {
  const baseUrl = 'http://localhost:3001/api';

  console.log("=== Testing 401 (No Token) ===");
  const resNoToken = await fetch(`${baseUrl}/dashboard`);
  console.log(resNoToken.status, await resNoToken.json());

  console.log("\n=== Testing 401 (Garbage Token) ===");
  const resGarbage = await fetch(`${baseUrl}/dashboard`, { headers: { 'Authorization': 'Bearer garbage_token_here' } });
  console.log(resGarbage.status, await resGarbage.json());

  console.log("\n=== Testing /api/auth/login ===");
  const loginRes = await fetch(`${baseUrl}/auth/login`, { method: 'POST' });
  const { token } = await loginRes.json();
  console.log("Got token (truncated):", token.substring(0, 15) + "...");

  const headers = { 'Authorization': `Bearer ${token}` };

  console.log("\n=== Testing /api/dashboard ===");
  const resDash = await fetch(`${baseUrl}/dashboard`, { headers });
  console.log(resDash.status, await resDash.json());

  console.log("\n=== Testing /api/cashflow/forecast ===");
  const resForecast = await fetch(`${baseUrl}/cashflow/forecast?days=30`, { headers });
  console.log(resForecast.status, await resForecast.json());

  console.log("\n=== Testing /api/invoices ===");
  const resInvoices = await fetch(`${baseUrl}/invoices`, { headers });
  console.log(resInvoices.status, await resInvoices.json());

  console.log("\n=== Testing /api/expenses ===");
  const resExpenses = await fetch(`${baseUrl}/expenses`, { headers });
  console.log(resExpenses.status, await resExpenses.json());

  console.log("\n=== Testing /api/credit-score ===");
  const resScore = await fetch(`${baseUrl}/credit-score`, { headers });
  console.log(resScore.status, await resScore.json());

  console.log("\n=== Testing /api/insights ===");
  const resInsights = await fetch(`${baseUrl}/insights`, { headers });
  console.log(resInsights.status, await resInsights.json());

  console.log("\n=== Testing /api/simulate/what-if ===");
  const resWhatIf = await fetch(`${baseUrl}/simulate/what-if`, { 
    method: 'POST', 
    headers: { ...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({})
  });
  console.log(resWhatIf.status, await resWhatIf.json());

  console.log("\n=== Testing /api/import/csv ===");
  const resCsv = await fetch(`${baseUrl}/import/csv`, { method: 'POST', headers });
  console.log(resCsv.status, await resCsv.json());
}

run().catch(console.error);
