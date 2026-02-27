const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const razorpay = require('../../config/razorpay');  
const crypto = require('crypto');

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

// Initiate Razorpay order for wallet top-up
const initiateAddMoney = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.user._id;

    if (!amount || isNaN(amount) || amount < 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'Minimum top-up amount is ₹100' 
      });
    }
    
      // Ensure Razorpay keys are configured
      if (!process.env.RAZORPAY_KEY_ID) {
        console.error('Razorpay key id missing in env');
        return res.status(500).json({ success: false, message: 'Razorpay not configured on server' });
      }

    const amountInPaise = Math.round(Number(amount) * 100);

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      // FIXED: Short receipt (under 40 chars)
      receipt: `wltp_${Date.now().toString().slice(-8)}_${Math.floor(Math.random() * 9000) + 1000}`,
      notes: {
        userId: userId.toString(),
        purpose: 'wallet_topup'
      }
    });
    
      if (!rzpOrder || !rzpOrder.id) {
        console.error('Invalid Razorpay order returned:', rzpOrder);
        return res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
      }

    res.json({
      success: true,
      razorpay: {
        key: process.env.RAZORPAY_KEY_ID,
        order_id: rzpOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        name: "Your Store Name",
        description: `Add ₹${amount} to Wallet`,
        prefill: {
          name: req.session.user.name || 'Customer',
          email: req.session.user.email || '',
          contact: req.session.user.phone || ''
        },
        theme: { color: "#5a7f72" }
      },
      amount: Number(amount)
    });

  } catch (err) {
    console.error('Initiate add money error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to initiate payment' });
  }
};

// Verify payment and credit wallet
const verifyAddMoney = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount  // original amount in rupees
    } = req.body;

    const userId = req.session.user._id;

    // Basic validation
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay secret missing in env');
      return res.status(500).json({ success: false, message: 'Razorpay not configured on server' });
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Credit wallet
    const creditAmount = Number(amount);
    await addToWallet(
      userId,
      creditAmount,
      'credit',
      `Wallet Top-up via Razorpay`,
      null  // no orderId for top-up
    );

    res.json({
      success: true,
      message: `₹${creditAmount.toLocaleString()} added to your wallet!`,
      newBalance: (await User.findById(userId).select('wallet.balance')).wallet.balance
    });

  } catch (err) {
    console.error('Verify add money error:', err);
    res.status(500).json({ success: false, message: 'Failed to add money to wallet' });
  }
};

module.exports = { addToWallet, getWallet, initiateAddMoney, verifyAddMoney };