// Netlify Function — whisperx-poll.js
// Vérifie le statut d'un job WhisperX via son event_id HF
// Appelé toutes les 3s par le navigateur

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_SPACE_URL = 'https://rushup-ai-rushup-whisperx.hf.space';

  const eventId = event.queryStringParameters && event.queryStringParameters.event_id;
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'event_id manquant' }) };
  }

  try {
    const getRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` }
    });

    console.log('[WhisperX-Poll] Status:', getRes.status, 'event_id:', eventId);

    if (!getRes.ok) {
      return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };
    }

    const text = await getRes.text();

    if (text.includes('event: complete')) {
      const dataMatch = text.match(/data:\s*(\[.*?\])/s);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        const rawResult = data[0];

        // Parse le JSON retourné par app.py
        let words;
        if (typeof rawResult === 'string') {
          const parsed = JSON.parse(rawResult);
          words = parsed.words;
        } else if (rawResult && rawResult.words) {
          words = rawResult.words;
        } else {
          words = rawResult;
        }

        console.log('[WhisperX-Poll] Complet —', words && words.length, 'mots');
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'complete', words })
        };
      }
    } else if (text.includes('event: error')) {
      return { statusCode: 200, body: JSON.stringify({ status: 'error', error: 'WhisperX erreur' }) };
    }

    // Toujours en cours
    return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };

  } catch (err) {
    console.error('[WhisperX-Poll] Exception:', err.message);
    return { statusCode: 200, body: JSON.stringify({ status: 'processing' }) };
  }
};
