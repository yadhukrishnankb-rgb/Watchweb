
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();
const uploadConfig = multer({
    storage,
    limits: {
        files: 4,
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

const processImages = async (req, res, next) => {
    try {
        if (!req.files || !Array.isArray(req.files) || req.files.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Please upload 3-4 images'
            });
        }

        req.processedImages = [];

        for (const file of req.files) {
            const filename = `${uuidv4()}.webp`;
            const filepath = path.join('uploads', 'products', filename);

            // Process image with sharp
            await sharp(file.buffer)
                .resize(800, 800, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .webp({ quality: 85 })
                .toFile(path.join('public', filepath));

            req.processedImages.push('/' + filepath.replace(/\\/g, '/'));
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    upload: uploadConfig.array('productImages', 4),
    processImages
};
