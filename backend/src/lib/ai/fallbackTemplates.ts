export function fallbackNarrative(contextType: string, inputData: any): string {
  if (contextType === 'whatIf') {
    const drop = inputData.currentRunwayDays ? (inputData.currentRunwayDays - inputData.scenarioRunwayDays) / inputData.currentRunwayDays : 0;
    return `Delaying expected inflows reduces your runway from ${inputData.currentRunwayDays} to ${inputData.scenarioRunwayDays} days (a ${(drop * 100).toFixed(0)}% drop). The cash impact is ${inputData.cashImpact}. Focus on the suggested actions to bridge this gap.`;
  }
  if (contextType === 'creditScore') {
    return `Your business credit score is ${inputData.score}, indicating ${inputData.riskLevel}. ${inputData.explanation || ''}`;
  }
  if (contextType === 'dashboard') {
    return `Current cash position is ${inputData.cashPosition} with a runway of ${inputData.runway} days.`;
  }
  return 'Narrative generated from fallback template.';
}
