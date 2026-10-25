const express = require('express');
const router = express.Router();
const History = require('../models/History');
const { protect } = require('../middleware/auth');

router.use(protect);

// @route  GET /api/history
// @desc   Get request history with optional search/filter
router.get('/', async (req, res) => {
  try {
    const { search, method, page = 1, limit = 50 } = req.query;
    const filter = { user: req.user._id };

    if (method && method !== 'ALL') {
      filter.method = method;
    }

    if (search) {
      filter.$or = [
        { url: { $regex: search, $options: 'i' } },
        { method: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await History.countDocuments(filter);
    const history = await History.find(filter)
      .sort({ executedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      history,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch history.' });
  }
});

// @route  DELETE /api/history
// @desc   Clear all history for user
router.delete('/', async (req, res) => {
  try {
    await History.deleteMany({ user: req.user._id });
    res.json({ success: true, message: 'History cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear history.' });
  }
});

// @route  DELETE /api/history/:id
// @desc   Delete a single history entry
router.delete('/:id', async (req, res) => {
  try {
    const entry = await History.findOne({ _id: req.params.id, user: req.user._id });
    if (!entry) {
      return res.status(404).json({ success: false, message: 'History entry not found.' });
    }
    await entry.deleteOne();
    res.json({ success: true, message: 'History entry deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete history entry.' });
  }
});

module.exports = router;
