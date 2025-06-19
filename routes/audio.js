const express = require('express');
const router = express.Router();
const Recording = require('../models/Recording');
const axios = require('axios');
const admin = require('firebase-admin');

// Transcription via AssemblyAI
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

// Summarization via Hugging Face
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

// API Route: Process audio
router.post('/process-audio', async (req, res) => {
  const { audioUrl, userId, date } = req.body;
  const transcript = await transcribe(audioUrl);
  const summary = await summarize(transcript);

  const record = new Recording({ userId, date, audioUrl, transcript, summary });
  await record.save();

  const yearMonth = date.slice(0, 7);
  const day = date.slice(8, 10);

  await admin.firestore()
    .collection('voice_entries')
    .doc(userId)
    .collection(yearMonth)
    .doc(day)
    .collection('clips')
    .add({ audioUrl, transcript, summary, timestamp: new Date().toISOString() });

  res.send({ message: "✅ Audio processed", transcript, summary });
});

// API Route: Get all available year-month -> days
router.get('/entries/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = {};
  const yearMonthsSnap = await admin.firestore().collection('voice_entries').doc(userId).listCollections();

  for (const ymCol of yearMonthsSnap) {
    const dayDocs = await ymCol.listDocuments();
    result[ymCol.id] = dayDocs.map(doc => doc.id);
  }

  res.send(result);
});

// API Route: Get all clips for specific day
router.get('/entries/:userId/:yearMonth/:day', async (req, res) => {
  const { userId, yearMonth, day } = req.params;
  const clipsSnap = await admin.firestore()
    .collection('voice_entries')
    .doc(userId)
    .collection(yearMonth)
    .doc(day)
    .collection('clips')
    .get();

  const clips = clipsSnap.docs.map(doc => doc.data());
  res.send(clips);
});

module.exports = router;