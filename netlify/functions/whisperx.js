// Netlify Function — whisperx.js
// Appelle le Space HF rushup-whisperx via l'API Gradio moderne
// POST /call/predict → event_id → GET /call/predict/{event_id}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_SPACE_URL = 'https://rushup-ai-rushup-whisperx.hf.space';

  if (!HF_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'HF_TOKEN manquant' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body JSON invalide' }) };
  }

  const { audioBase64, mimeType } = body;
  if (!audioBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'audioBase64 manquant' }) };
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const contentType = mimeType || 'audio/mpeg';

    console.log('[WhisperX] Buffer size:', audioBuffer.length, 'bytes');

    // ÉTAPE 1 — Upload via /upload (endpoint Gradio standard)
    const boundary = 'boundary' + Date.now();
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="audio.mp3"\r\nContent-Type: ${contentType}\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const formBody = Buffer.concat([header, audioBuffer, footer]);

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody
    });

    console.log('[WhisperX] Upload status:', uploadRes.status);

    let audioPath;

    if (uploadRes.ok) {
      const uploadData = await uploadRes.json();
      console.log('[WhisperX] Upload result:', JSON.stringify(uploadData).slice(0, 200));
      audioPath = Array.isArray(uploadData) ? uploadData[0] : (uploadData.path || uploadData);
    } else {
      // Fallback — envoie le base64 directement dans data
      console.warn('[WhisperX] Upload échoué, fallback base64');
      audioPath = `data:${contentType};base64,${audioBase64.slice(0, 100)}...`;
    }

    // ÉTAPE 2 — POST /call/predict pour lancer le job
    const predictPayload = {
      data: [
        { path: audioPath, meta: { _type: 'gradio.FileData' } },
        'fr'
      ]
    };

    console.log('[WhisperX] POST /call/predict');
    const postRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(predictPayload)
    });

    console.log('[WhisperX] POST status:', postRes.status);

    if (!postRes.ok) {
      const errText = await postRes.text();
      console.error('[WhisperX] POST error:', errText.slice(0, 500));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erreur POST predict: ' + errText.slice(0, 300) })
      };
    }

    const postData = await postRes.json();
    const eventId = postData.event_id;
    console.log('[WhisperX] event_id:', eventId);

    if (!eventId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Pas d\'event_id retourné', raw: JSON.stringify(postData).slice(0, 200) })
      };
    }

    // ÉTAPE 3 — GET /call/predict/{event_id} pour récupérer le résultat
    // Poll jusqu'à complétion (max 60 secondes)
    let words = null;
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000)); // attendre 2s entre chaque poll

      const getRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
        headers: { 'Authorization': `Bearer ${HF_TOKEN}` }
      });

      console.log(`[WhisperX] Poll ${i+1} status:`, getRes.status);

      if (!getRes.ok) continue;

      const text = await getRes.text();
      console.log('[WhisperX] Poll result (100 chars):', text.slice(0, 100));

      // Parse le SSE — cherche "event: complete"
      if (text.includes('event: complete')) {
        const dataMatch = text.match(/data:\s*(\[.*\])/s);
        if (dataMatch) {
          const data = JSON.parse(dataMatch[1]);
          words = data[0];
          break;
        }
      } else if (text.includes('event: error')) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'WhisperX erreur pendant le traitement' })
        };
      }
    }

    if (!words || !Array.isArray(words) || !words.length) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'WhisperX timeout ou aucun mot retourné' })
      };
    }

    console.log('[WhisperX] Succès —', words.length, 'mots');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words })
    };

  } catch (err) {
    console.error('[WhisperX] Exception:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
