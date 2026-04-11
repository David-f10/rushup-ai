// Netlify Background Function — whisperx-background.js
// Syntaxe correcte pour Netlify Background Functions

export default async (req, context) => {
  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_SPACE_URL = 'https://rushup-ai-rushup-whisperx.hf.space';

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!HF_TOKEN) {
    return new Response(JSON.stringify({ error: 'HF_TOKEN manquant' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Body JSON invalide' }), { status: 400 });
  }

  const { audioBase64, mimeType } = body;
  if (!audioBase64) {
    return new Response(JSON.stringify({ error: 'audioBase64 manquant' }), { status: 400 });
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const contentType = mimeType || 'audio/mpeg';

    console.log('[WhisperX-BG] Buffer size:', audioBuffer.length, 'bytes');

    // Upload audio
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

    console.log('[WhisperX-BG] Upload status:', uploadRes.status);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return new Response(JSON.stringify({ error: 'Upload échoué: ' + errText.slice(0, 200) }), { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const audioPath = Array.isArray(uploadData) ? uploadData[0] : (uploadData.path || uploadData);
    console.log('[WhisperX-BG] Audio path:', audioPath);

    // Lance le job WhisperX
    const postRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: [
          { path: audioPath, meta: { _type: 'gradio.FileData' } },
          'fr'
        ]
      })
    });

    console.log('[WhisperX-BG] POST predict status:', postRes.status);

    if (!postRes.ok) {
      const errText = await postRes.text();
      return new Response(JSON.stringify({ error: 'POST predict échoué: ' + errText.slice(0, 200) }), { status: 500 });
    }

    const postData = await postRes.json();
    const eventId = postData.event_id;
    console.log('[WhisperX-BG] event_id:', eventId);

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Pas d\'event_id' }), { status: 500 });
    }

    return new Response(JSON.stringify({ event_id: eventId, status: 'processing' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[WhisperX-BG] Exception:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const config = {
  type: 'experimental-background'
};
