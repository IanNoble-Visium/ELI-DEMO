let VertexAI; try { ({ VertexAI } = require('@google-cloud/vertexai')); } catch (_) { VertexAI = null; }

const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const LOCATION = process.env.GOOGLE_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'gemini-1.5-flash-002';

let vertex;
function isVertexConfigured() { return Boolean(PROJECT_ID && LOCATION && VertexAI); }
function getClient() {
  if (!vertex && isVertexConfigured()) {
    const opts = { project: PROJECT_ID, location: LOCATION };
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (saJson) {
      try { const credentials = JSON.parse(saJson); opts.googleAuthOptions = { credentials }; } catch (_) {}
    }
    if (process.env.GOOGLE_API_KEY && !opts.googleAuthOptions && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      opts.apiKey = process.env.GOOGLE_API_KEY;
    }
    vertex = new VertexAI(opts);
  }
  return vertex;
}

function safeJsonParse(text) { try { return JSON.parse(text); } catch { return null; } }

async function generateJson({ prompt, schema, systemInstruction }) {
  if (!isVertexConfigured()) return { enabled: false, reason: 'Vertex not configured', output: null };
  try {
    const client = getClient();
    const model = client.getGenerativeModel({ model: MODEL, systemInstruction, generationConfig: { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}), temperature: 0.2, topP: 0.8 } });
    const resp = await model.generateContent([{ text: prompt }]);
    const text = resp?.response?.text?.() || '';
    const json = safeJsonParse(text);
    return { enabled: true, output: json, raw: text };
  } catch (err) {
    console.error('[vertex] generation error', err); return { enabled: true, output: null, error: 'Vertex generation failed' };
  }
}

async function classifyPatterns({ context, schema }) {
  const systemInstruction = 'You are an analytics assistant. Return strictly JSON matching the provided schema. Do not include extra fields.';
  const prompt = `Analyze the following telemetry context and summarize behavior baselines and deviations. Return JSON only.\n\nContext:\n${JSON.stringify(context).slice(0, 12000)}`;
  return generateJson({ prompt, schema, systemInstruction });
}

async function forecastSeries({ series, horizonMinutes = 240, granularityMinutes = 5 }) {
  const schema = { type: 'object', properties: { forecast: { type: 'array', items: { type: 'object', properties: { t: { type: 'string' }, y: { type: 'number' }, lo: { type: 'number' }, hi: { type: 'number' } }, required: ['t','y'] } } }, required: ['forecast'] };
  const systemInstruction = 'You are a time-series forecasting engine. Use sensible uncertainty bands. Output only the JSON schema provided.';
  const prompt = `Given the recent time series (ISO timestamps and values), produce a ${horizonMinutes} minute forecast at ${granularityMinutes} minute intervals. Return array field forecast with objects {t,y,lo,hi}.\n\nHistory:\n${JSON.stringify(series).slice(0, 12000)}`;
  return generateJson({ prompt, schema, systemInstruction });
}

module.exports = { generateJson, classifyPatterns, forecastSeries, isVertexConfigured };

