exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const { audioBase64, mimeType, language } = JSON.parse(event.body);
    if (!audioBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'audioBase64 requis' }) };

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType === 'audio/mp4' ? 'm4a' : 'mp3';
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const parts = [];
    const addField = (name, value) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };

    addField('model', 'whisper-1');
    addField('response_format', 'srt');
    addField('language', language || 'fr');

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType || 'audio/mpeg'}\r\n\r\n`));
    parts.push(audioBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      body
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
