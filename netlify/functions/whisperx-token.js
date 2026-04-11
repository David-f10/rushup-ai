// Netlify Function — whisperx-token.js
// Retourne le HF_TOKEN pour que le navigateur puisse appeler HF directement
// Identique à claude.js qui retourne la clé Anthropic

exports.handler = async (event) => {
  const HF_TOKEN = process.env.HF_TOKEN;

  if (!HF_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'HF_TOKEN manquant' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: HF_TOKEN })
  };
};
