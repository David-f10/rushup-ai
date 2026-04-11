// Netlify Function — whisperx-poll.js
// Vérifie le statut d'un job WhisperX via son event_id

export default async (req, context) => {
  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_SPACE_URL = 'https://rushup-ai-rushup-whisperx.hf.space';

  const url = new URL(req.url);
  const eventId = url.searchParams.get('event_id');

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'event_id manquant' }), { status: 400 });
  }

  try {
    const getRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` }
    });

    console.log('[WhisperX-Poll] Status:', getRes.status, 'event_id:', eventId);

    if (!getRes.ok) {
      return new Response(JSON.stringify({ status: 'processing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const text = await getRes.text();

    if (text.includes('event: complete')) {
      const dataMatch = text.match(/data:\s*(\[.*?\])/s);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        const rawResult = data[0];

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
        return new Response(JSON.stringify({ status: 'complete', words }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (text.includes('event: error')) {
      return new Response(JSON.stringify({ status: 'error' }), { status: 200 });
    }

    return new Response(JSON.stringify({ status: 'processing' }), { status: 200 });

  } catch (err) {
    console.error('[WhisperX-Poll] Exception:', err.message);
    return new Response(JSON.stringify({ status: 'processing' }), { status: 200 });
  }
};
