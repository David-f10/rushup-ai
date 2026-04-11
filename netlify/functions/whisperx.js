// Netlify Function — whisperx.js
// Envoie le MP3 au Space Hugging Face rushup-whisperx
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
    // Convertit base64 en Buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Upload l'audio sur le Space HF via l'API Gradio
    const uploadRes = await fetch(`${HF_SPACE_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': mimeType || 'audio/mpeg'
      },
      body: audioBuffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erreur upload HF: ' + errText })
      };
    }

    const uploadData = await uploadRes.json();
    const audioPath = uploadData[0] || uploadData.file || uploadData;

    // Appelle l'endpoint Gradio /run/predict
    const predictRes = await fetch(`${HF_SPACE_URL}/run/predict`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fn_index: 0,
        data: [audioPath, 'fr']  // audio + langue
      })
    });

    if (!predictRes.ok) {
      const errText = await predictRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Erreur WhisperX: ' + errText })
      };
    }

    const predictData = await predictRes.json();
    const words = predictData.data && predictData.data[0];

    if (!words || !words.length) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'WhisperX n\'a retourné aucun mot' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
