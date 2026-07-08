
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const streamifier = require('streamifier');
const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');
const messages = require('../constants/messages');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp']);

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.isValidationError = true;
  return error;
};

const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'profile-pictures',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
  }
});

const productUploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 4 }
});

const profileUploadConfig = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  }
});

async function validateProductImageFile(file) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw createValidationError(messages.PRODUCT_IMAGES_REQUIRED);
  }

  const fileName = (file.originalname || '').toLowerCase();
  const extension = fileName.slice(fileName.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw createValidationError(messages.PRODUCT_IMAGE_TYPE_INVALID);
  }

  const mimeType = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw createValidationError(messages.PRODUCT_IMAGE_TYPE_INVALID);
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw createValidationError(messages.PRODUCT_IMAGE_SIZE_INVALID);
  }

  const metadata = await sharp(file.buffer).metadata();
  const format = (metadata.format || '').toLowerCase();
  if (!ALLOWED_IMAGE_FORMATS.has(format)) {
    throw createValidationError(messages.PRODUCT_IMAGE_INVALID);
  }

  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw createValidationError(messages.PRODUCT_IMAGE_INVALID);
  }

  return metadata;
}

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'products',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

const upload = (req, res, next) => {
  productUploadConfig.array('productImages', 4)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: messages.PRODUCT_IMAGE_SIZE_INVALID });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ success: false, message: messages.PRODUCT_MAX_IMAGES });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(400).json({ success: false, message: err.message || 'File upload error' });
    }

    try {
      const uploadedFiles = [];
      const files = Array.isArray(req.files) ? req.files : [];
      let validationError = null;

      for (const file of files) {
        try {
          await validateProductImageFile(file);
          const result = await uploadBufferToCloudinary(file.buffer);
          uploadedFiles.push({
            ...file,
            path: result.secure_url,
            public_id: result.public_id
          });
        } catch (fileError) {
          if (fileError.isValidationError) {
            validationError = validationError || fileError.message;
            continue;
          }
          console.error('Cloudinary upload failed:', fileError);
          continue;
        }
      }

      req.files = uploadedFiles;
      if (validationError) {
        req.uploadValidationError = validationError;
      }
      next();
    } catch (error) {
      console.error('Product upload middleware error:', error);
      return res.status(500).json({ success: false, message: messages.PRODUCT_IMAGE_UPLOAD_FAILED });
    }
  });
};

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
  upload,
  profileUpload,
  processImages: (req, res, next) => next()
};


