const mongoose = require('mongoose');

const headerSchema = new mongoose.Schema({
  key: { type: String, default: '' },
  value: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const paramSchema = new mongoose.Schema({
  key: { type: String, default: '' },
  value: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const authSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['none', 'apiKey', 'bearer', 'basic'],
    default: 'none'
  },
  apiKey: { type: String, default: '' },
  apiKeyHeader: { type: String, default: 'X-API-Key' },
  bearerToken: { type: String, default: '' },
  basicUsername: { type: String, default: '' },
  basicPassword: { type: String, default: '' }
}, { _id: false });

const responseSchema = new mongoose.Schema({
  status: { type: Number },
  statusText: { type: String },
  time: { type: Number },
  size: { type: Number },
  headers: { type: mongoose.Schema.Types.Mixed },
  body: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const requestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection',
    default: null
  },
  name: {
    type: String,
    required: [true, 'Request name is required'],
    trim: true,
    maxlength: [200, 'Request name cannot exceed 200 characters']
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    required: true,
    default: 'GET'
  },
  url: {
    type: String,
    required: [true, 'URL is required'],
    trim: true
  },
  headers: {
    type: [headerSchema],
    default: []
  },
  params: {
    type: [paramSchema],
    default: []
  },
  auth: {
    type: authSchema,
    default: () => ({})
  },
  body: {
    type: String,
    default: ''
  },
  bodyType: {
    type: String,
    enum: ['none', 'json', 'text', 'form'],
    default: 'none'
  },
  lastResponse: {
    type: responseSchema,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

requestSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Request', requestSchema);
