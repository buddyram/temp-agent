export const API_BASE = import.meta.env.PROD
  ? 'https://temp-agent-api-679126705090.us-west1.run.app'
  : '';

export const OUTPUTS_BASE = import.meta.env.PROD
  ? 'https://raw.githubusercontent.com/buddyram/temp-agent/main/outputs'
  : 'outputs';
