const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const razorpay = require('../../config/razorpay');  
const crypto = require('crypto');


const addToWallet = async (userId, amount, type, reason, orderId = null) => {
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
    amount: Math.abs(amount), 
    type,
    reason: reason.trim(),
    orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
    date: new Date()
  };

  const existingUser = await User.findById(userId).select('wallet').lean();
  if (!existingUser) {
    throw new Error('User not found');
  }

  let needsRepair = false;
  if (!existingUser.wallet || Array.isArray(existingUser.wallet)) {
    needsRepair = true;
  } else {
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

  const update = {
    $push: { 'wallet.transactions': transaction }
  };
  if (type === 'credit') {
    update.$inc = { 'wallet.balance': amount };
  } else {
    // debit
    update.$inc = { 'wallet.balance': -amount };
  }

  const query = { _id: userId };
  if (type === 'debit') {
    query['wallet.balance'] = { $gte: amount };
  }

  const opts = { new: true, useFindAndModify: false };
  const updated = await User.findOneAndUpdate(query, update, opts).lean();

  if (!updated) {
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

const getWallet = async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10; 
    const skip = (page - 1) * limit;

    const user = await User.findById(req.session.user._id)
      .select('wallet.balance wallet.transactions')
      .populate({
        path: 'wallet.transactions.orderId',
        select: 'orderId'
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const sortedTransactions = (user.wallet.transactions || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const totalTransactions = sortedTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const paginatedTransactions = sortedTransactions.slice(skip, skip + limit);

    if (page > totalPages && totalPages > 0) {
      return res.redirect(`/wallet?page=${totalPages}`);
    }

    res.render('user/wallet', {
      wallet: {
        balance: user.wallet.balance || 0,
        transactions: paginatedTransactions
      },
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalTransactions: totalTransactions,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      },
      user: req.session.user
    });
  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).json({ success: false, message: 'Error loading wallet' });
  }
};

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
    
      if (!process.env.RAZORPAY_KEY_ID) {
        console.error('Razorpay key id missing in env');
        return res.status(500).json({ success: false, message: 'Razorpay not configured on server' });
      }

    const amountInPaise = Math.round(Number(amount) * 100);

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
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

const verifyAddMoney = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount  
    } = req.body;

    const userId = req.session.user._id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay secret missing in env');
      return res.status(500).json({ success: false, message: 'Razorpay not configured on server' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    const creditAmount = Number(amount);
    await addToWallet(
      userId,
      creditAmount,
      'credit',
      `Wallet Top-up via Razorpay`,
      null  
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