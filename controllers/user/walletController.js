const User = require('../../models/userSchema');
const mongoose = require('mongoose');

// Helper: Add credit or debit to wallet (atomic & safe)
// Uses a single atomic update to avoid requiring MongoDB transactions, which
// aren't supported on standalone/development servers. This keeps the helper
// compatible with replica sets, but gracefully works on local Mongo too.
const addToWallet = async (userId, amount, type, reason, orderId = null) => {
  // Validate inputs
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  if (!['credit', 'debit'].includes(type)) {
    throw new Error('Type must be "credit" or "debit"');
  }
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('Reason is required');
  }

  const transaction = {
    amount: Math.abs(amount), // always store positive value
    type,
    reason: reason.trim(),
    orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
    date: new Date()
  };

  // Read user to inspect wallet shape and repair if necessary.
  const existingUser = await User.findById(userId).select('wallet').lean();
  if (!existingUser) {
    throw new Error('User not found');
  }

  // If wallet is missing, not an object, or an array, reset to default structure.
  let needsRepair = false;
  if (!existingUser.wallet || Array.isArray(existingUser.wallet)) {
    needsRepair = true;
  } else {
    // ensure expected keys exist
    if (typeof existingUser.wallet.balance !== 'number' || !Array.isArray(existingUser.wallet.transactions)) {
      needsRepair = true;
    }
  }
  if (needsRepair) {
    await User.updateOne(
      { _id: userId },
      { $set: { wallet: { balance: 0, transactions: [] } } }
    );
  }

  // Build update object: push transaction and adjust balance.
  const update = {
    $push: { 'wallet.transactions': transaction }
  };
  if (type === 'credit') {
    update.$inc = { 'wallet.balance': amount };
  } else {
    // debit
    update.$inc = { 'wallet.balance': -amount };
  }

  // Query must check balance for debit operations to prevent it going
  // negative; findOneAndUpdate returns null if condition not met.
  const query = { _id: userId };
  if (type === 'debit') {
    query['wallet.balance'] = { $gte: amount };
  }

  const opts = { new: true, useFindAndModify: false };
  const updated = await User.findOneAndUpdate(query, update, opts).lean();

  if (!updated) {
    // Could be due to user not found or insufficient balance
    if (type === 'debit') {
      throw new Error('Insufficient wallet balance');
    }
    throw new Error('User not found');
  }

  return {
    success: true,
    newBalance: updated.wallet.balance,
    transaction
  };
};

// Get wallet details for the logged-in user
const getWallet = async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(req.session.user._id)
      .select('wallet.balance wallet.transactions')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Sort transactions by date (newest first)
    const sortedTransactions = (user.wallet.transactions || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.render('user/wallet', {
      wallet: {
        balance: user.wallet.balance || 0,
        transactions: sortedTransactions
      },
      user: req.session.user
    });
  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).json({ success: false, message: 'Error loading wallet' });
  }
};

module.exports = { addToWallet, getWallet };