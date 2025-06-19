const express = require('express');
const router = express.Router();
const Recording = require('../models/Recording');
const axios = require('axios');
const admin = require('firebase-admin');

async function transcribe(audioUrl) {
  const res = await axios.post('https://api.assemblyai.com/v2/transcript', {
    audio_url: audioUrl
  }, {
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
  });

  const id = res.data.id;
  let transcript;
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
    });
    if (check.data.status === 'completed') {
      transcript = check.data.text;
      break;
    }
  }
  return transcript;
}

async function summarize(text) {
  const res = await axios.post(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    { inputs: text },
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (Array.isArray(res.data) && res.data[0]?.summary_text) {
    return res.data[0].summary_text;
  } else {
    return '⚠️ Summary not available or model is warming up.';
  }
}


router.post('/process-audio', async (req, res) => {
  const { audioUrl, userId, date } = req.body;
  const transcript = await transcribe(audioUrl);
  const summary = await summarize(transcript);

  const record = new Recording({ userId, date, audioUrl, transcript, summary });
  await record.save();

  await admin.firestore().collection('voice_entries').add({
    userId, date, audioUrl, transcript, summary
  });

  res.send({ message: "✅ Audio processed", transcript, summary });
});

module.exports = router;
