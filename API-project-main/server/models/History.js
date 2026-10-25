const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  headers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  auth: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  body: {
    type: String,
    default: ''
  },
  bodyType: {
    type: String,
    default: 'none'
  },
  response: {
    status: Number,
    statusText: String,
    time: Number,
    size: Number,
    body: mongoose.Schema.Types.Mixed
  },
  executedAt: {
    type: Date,
    default: Date.now
  }
});

// Keep only last 200 history records per user
historySchema.index({ user: 1, executedAt: -1 });

module.exports = mongoose.model('History', historySchema);
