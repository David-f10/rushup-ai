// Netlify Function — whisperx.js
// Envoie le MP3 au Space Hugging Face rushup-whisperx via API Gradio
// Retourne les word timestamps WhisperX précis

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_SPACE_URL = 'https://rushup-ai-rushup-whisperx.hf.space';

  if (!HF_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'HF_TOKEN manquant dans les variables Netlify' })
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

    console.log('[WhisperX] Taille audio buffer:', audioBuffer.length, 'bytes');

    // ÉTAPE 1 — Upload du fichier audio via multipart/form-data
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="audio.mp3"\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const formBody = Buffer.concat([header, audioBuffer, footer]);

    console.log('[WhisperX] Upload vers:', `${HF_SPACE_URL}/upload`);

    const uploadRes = await fetch(`${HF_SPACE_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formBody.length.toString()
      },
      body: formBody
    });

    console.log('[WhisperX] Upload status:', uploadRes.status);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[WhisperX] Erreur upload:', errText.slice(0, 500));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erreur upload HF: ' + errText.slice(0, 300) })
      };
    }

    const uploadData = await uploadRes.json();
    console.log('[WhisperX] Upload result:', JSON.stringify(uploadData).slice(0, 200));

    const audioPath = Array.isArray(uploadData) ? uploadData[0] : uploadData;

    // ÉTAPE 2 — Appel Gradio /api/predict
    const predictPayload = {
      data: [
        { path: audioPath, meta: { _type: 'gradio.FileData' } },
        'fr'
      ]
    };

    console.log('[WhisperX] Appel predict, payload:', JSON.stringify(predictPayload).slice(0, 300));

    const predictRes = await fetch(`${HF_SPACE_URL}/api/predict`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(predictPayload)
    });

    console.log('[WhisperX] Predict status:', predictRes.status);

    if (!predictRes.ok) {
      const errText = await predictRes.text();
      console.error('[WhisperX] Erreur predict:', errText.slice(0, 500));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erreur WhisperX predict: ' + errText.slice(0, 300) })
      };
    }

    const predictData = await predictRes.json();
    console.log('[WhisperX] Predict keys:', Object.keys(predictData));

    const words = predictData.data && predictData.data[0];

    if (!words || !Array.isArray(words) || !words.length) {
      console.error('[WhisperX] Aucun mot:', JSON.stringify(predictData).slice(0, 300));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'WhisperX n\'a retourné aucun mot', raw: JSON.stringify(predictData).slice(0, 300) })
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
