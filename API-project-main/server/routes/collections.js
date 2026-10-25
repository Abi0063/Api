const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Collection = require('../models/Collection');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// @route  GET /api/collections
// @desc   Get all collections for logged-in user
router.get('/', async (req, res) => {
  try {
    const collections = await Collection.find({ user: req.user._id }).sort({ createdAt: -1 });

    // Get request count per collection
    const counts = await Request.aggregate([
      { $match: { user: req.user._id, collection: { $ne: null } } },
      { $group: { _id: '$collection', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const collectionsWithCount = collections.map(col => ({
      ...col.toObject(),
      requestCount: countMap[col._id.toString()] || 0
    }));

    res.json({ success: true, collections: collectionsWithCount });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch collections.' });
  }
});

// @route  POST /api/collections
// @desc   Create a new collection
router.post('/', [
  body('name').trim().notEmpty().withMessage('Collection name is required').isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, description, color } = req.body;
    const collection = await Collection.create({
      user: req.user._id,
      name,
      description: description || '',
      color: color || '#6366f1'
    });

    res.status(201).json({ success: true, collection: { ...collection.toObject(), requestCount: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create collection.' });
  }
});

// @route  PUT /api/collections/:id
// @desc   Update a collection
router.put('/:id', [
  body('name').optional().trim().notEmpty().isLength({ max: 100 })
], async (req, res) => {
  try {
    const collection = await Collection.findOne({ _id: req.params.id, user: req.user._id });
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found.' });
    }

    const { name, description, color } = req.body;
    if (name) collection.name = name;
    if (description !== undefined) collection.description = description;
    if (color) collection.color = color;

    await collection.save();
    res.json({ success: true, collection });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update collection.' });
  }
});

// @route  DELETE /api/collections/:id
// @desc   Delete a collection and all its requests
router.delete('/:id', async (req, res) => {
  try {
    const collection = await Collection.findOne({ _id: req.params.id, user: req.user._id });
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found.' });
    }

    // Delete all requests in this collection
    await Request.deleteMany({ collection: req.params.id, user: req.user._id });
    await collection.deleteOne();

    res.json({ success: true, message: 'Collection and all its requests deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete collection.' });
  }
});

// @route  GET /api/collections/:id/export
// @desc   Export collection as JSON
router.get('/:id/export', async (req, res) => {
  try {
    const collection = await Collection.findOne({ _id: req.params.id, user: req.user._id });
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found.' });
    }

    const requests = await Request.find({ collection: req.params.id, user: req.user._id });

    const exportData = {
      exportedAt: new Date().toISOString(),
      collection: {
        name: collection.name,
        description: collection.description,
        color: collection.color
      },
      requests: requests.map(r => ({
        name: r.name,
        method: r.method,
        url: r.url,
        headers: r.headers,
        params: r.params,
        auth: r.auth,
        body: r.body,
        bodyType: r.bodyType
      }))
    };

    res.setHeader('Content-Disposition', `attachment; filename="${collection.name.replace(/[^a-z0-9]/gi, '_')}_collection.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to export collection.' });
  }
});

module.exports = router;
