const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Request = require('../models/Request');
const History = require('../models/History');
const { protect } = require('../middleware/auth');

router.use(protect);

// @route  GET /api/requests
// @desc   Get all requests (optionally filtered by collection)
router.get('/', async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.collection) {
      filter.collection = req.query.collection === 'uncategorized' ? null : req.query.collection;
    }

    const requests = await Request.find(filter)
      .populate('collection', 'name color')
      .sort({ updatedAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
  }
});

// @route  GET /api/requests/:id
// @desc   Get a single request
router.get('/:id', async (req, res) => {
  try {
    const request = await Request.findOne({ _id: req.params.id, user: req.user._id })
      .populate('collection', 'name color');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch request.' });
  }
});

// @route  POST /api/requests
// @desc   Save a new request
router.post('/', [
  body('name').trim().notEmpty().withMessage('Request name is required'),
  body('method').isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).withMessage('Invalid HTTP method'),
  body('url').trim().notEmpty().withMessage('URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, method, url, headers, params, auth, body: reqBody, bodyType, collection } = req.body;

    const request = await Request.create({
      user: req.user._id,
      collection: collection || null,
      name,
      method,
      url,
      headers: headers || [],
      params: params || [],
      auth: auth || { type: 'none' },
      body: reqBody || '',
      bodyType: bodyType || 'none'
    });

    res.status(201).json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save request.' });
  }
});

// @route  PUT /api/requests/:id
// @desc   Update a request
router.put('/:id', async (req, res) => {
  try {
    const request = await Request.findOne({ _id: req.params.id, user: req.user._id });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const fields = ['name', 'method', 'url', 'headers', 'params', 'auth', 'body', 'bodyType', 'collection', 'lastResponse'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        request[field] = req.body[field];
      }
    });

    await request.save();
    const updated = await Request.findById(request._id).populate('collection', 'name color');
    res.json({ success: true, request: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update request.' });
  }
});

// @route  DELETE /api/requests/:id
// @desc   Delete a request
router.delete('/:id', async (req, res) => {
  try {
    const request = await Request.findOne({ _id: req.params.id, user: req.user._id });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    await request.deleteOne();
    res.json({ success: true, message: 'Request deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete request.' });
  }
});

// @route  POST /api/requests/execute
// @desc   Execute an API request (proxy)
router.post('/execute', async (req, res) => {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  try {
    const { method, url, headers = [], params = [], auth, body: reqBody, bodyType } = req.body;

    if (!url || !method) {
      return res.status(400).json({ success: false, message: 'Method and URL are required.' });
    }

    // Build final URL with query params
    let finalUrl;
    try {
      finalUrl = new URL(url);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL format.' });
    }

    params.filter(p => p.enabled && p.key).forEach(p => {
      finalUrl.searchParams.set(p.key, p.value);
    });

    // Build headers object
    const finalHeaders = {};
    headers.filter(h => h.enabled && h.key).forEach(h => {
      finalHeaders[h.key] = h.value;
    });

    // Apply auth
    if (auth) {
      if (auth.type === 'bearer' && auth.bearerToken) {
        finalHeaders['Authorization'] = `Bearer ${auth.bearerToken}`;
      } else if (auth.type === 'apiKey' && auth.apiKey) {
        const headerName = auth.apiKeyHeader || 'X-API-Key';
        finalHeaders[headerName] = auth.apiKey;
      } else if (auth.type === 'basic' && auth.basicUsername) {
        const encoded = Buffer.from(`${auth.basicUsername}:${auth.basicPassword}`).toString('base64');
        finalHeaders['Authorization'] = `Basic ${encoded}`;
      }
    }

    // Prepare body
    let bodyData = null;
    if (['POST', 'PUT', 'PATCH'].includes(method) && reqBody && bodyType !== 'none') {
      bodyData = reqBody;
      if (bodyType === 'json' && !finalHeaders['Content-Type']) {
        finalHeaders['Content-Type'] = 'application/json';
      }
    }

    const startTime = Date.now();

    // Make the request
    const protocol = finalUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: finalUrl.hostname,
      port: finalUrl.port || (finalUrl.protocol === 'https:' ? 443 : 80),
      path: finalUrl.pathname + finalUrl.search,
      method: method,
      headers: finalHeaders,
      timeout: 30000
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      let rawData = '';
      proxyRes.on('data', chunk => { rawData += chunk; });
      proxyRes.on('end', async () => {
        const responseSize = Buffer.byteLength(rawData, 'utf8');
        let parsedBody;
        try {
          parsedBody = JSON.parse(rawData);
        } catch {
          parsedBody = rawData;
        }

        const responseData = {
          status: proxyRes.statusCode,
          statusText: proxyRes.statusMessage,
          time: responseTime,
          size: responseSize,
          headers: proxyRes.headers,
          body: parsedBody
        };

        // Save to history
        try {
          const historyCount = await History.countDocuments({ user: req.user._id });
          if (historyCount >= 200) {
            const oldest = await History.findOne({ user: req.user._id }).sort({ executedAt: 1 });
            if (oldest) await oldest.deleteOne();
          }

          await History.create({
            user: req.user._id,
            method,
            url: finalUrl.toString(),
            headers: finalHeaders,
            params,
            auth: auth || {},
            body: reqBody || '',
            bodyType: bodyType || 'none',
            response: responseData
          });
        } catch (histErr) {
          console.error('History save error:', histErr);
        }

        res.json({ success: true, response: responseData });
      });
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ success: false, message: `Request failed: ${err.message}` });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(408).json({ success: false, message: 'Request timed out after 30 seconds.' });
    });

    if (bodyData) {
      proxyReq.write(bodyData);
    }
    proxyReq.end();

  } catch (err) {
    console.error('Execute error:', err);
    res.status(500).json({ success: false, message: `Execution error: ${err.message}` });
  }
});

module.exports = router;
