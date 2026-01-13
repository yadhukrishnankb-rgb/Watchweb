
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// product storage (existing)
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

// profile storage (new)
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'profile-pictures',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
  }
});

// product uploader (existing-ish)
const productUploadConfig = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  }
});

// profile uploader (new) - single file named "profileImage"
const profileUploadConfig = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log('profile file filter', file.fieldname, file.mimetype);
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  }
});

// wrapper to send multer errors as JSON (so client sees message)
const profileUpload = (req, res, next) => {
  profileUploadConfig.single('profileImage')(req, res, (err) => {
    if (err) {
      console.error('profileUpload error:', err);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }
    next();
  });
};

module.exports = {
  upload: productUploadConfig.array('productImages', 4),
  profileUpload, // exported new middleware
  processImages: (req, res, next) => next()
};


