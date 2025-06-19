const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  userId: String,
  date: String,
  audioUrl: String,
  transcript: String,
  summary: String
});

module.exports = mongoose.model('Recording', RecordingSchema);
