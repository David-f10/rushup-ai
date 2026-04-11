const { Client } = require("@gradio/client");

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

  try {
    const { audioBase64, mimeType } = JSON.parse(event.body);
    if (!audioBase64) throw new Error('No audio provided');

    // Convertit base64 en Blob
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/mpeg' });

    // Appelle le Space HF
    const client = await Client.connect("rushup-ai/rushup-whisperx", {
      hf_token: process.env.HF_TOKEN
    });

    const result = await client.predict("/predict", {
      audio_file: audioBlob
    });

    return {
      statusCode: 200,
      headers,
      body: result.data[0]
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
