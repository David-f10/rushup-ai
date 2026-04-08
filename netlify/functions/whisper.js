const FormData = require('form-data');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { audioBase64, mimeType, language } = JSON.parse(event.body);
    if (!audioBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'audioBase64 requis' }) };
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType === 'audio/mp4' ? 'm4a' : 'mp3';

    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: `audio.${ext}`,
      contentType: mimeType || 'audio/mpeg'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'srt');
    formData.append('language', language || 'fr');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: response.status, headers, body: JSON.stringify({ error: `Whisper API error: ${err}` }) };
    }

    const srtText = await response.text();
    return { statusCode: 200, headers, body: JSON.stringify({ srt: srtText }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
