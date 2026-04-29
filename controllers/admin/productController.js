const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const Offer = require('../../models/offerSchema');



exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        const query = {
            ...(searchQuery && {
                $or: [
                    { productName: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ]
            })
        };

        const now = new Date();
        const [products, totalProducts] = await Promise.all([
            Product.find(query)
                .populate('category', 'name')
                .populate('offer')
                .sort({ createdAt: -1,_id:-1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Product.countDocuments(query)
        ]);

        const processedProducts = products.map(product => ({
            ...product,
            category: product.category || { name: 'Uncategorized' },
            statusClass: product.isBlocked ? 'text-red-600' : 'text-green-600',
            statusText: product.isBlocked ? 'Blocked' : 'Active',
            offerPercent: product.offer ? product.offer.percentage : 0,
            offerStart: product.offer ? product.offer.startDate : null,
            offerEnd: product.offer ? product.offer.endDate : null
        }));

        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Brand.find().sort({ name: 1 }).lean();

        res.render('admin/products', {
            products: processedProducts,
            categories,
            brands,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / limit),
            searchQuery
        });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.PRODUCTS_LOAD_ERROR });
    }
};




exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

    const product = await Product.findById(id).populate('category');
        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

    res.json({
      success: true,
      product
    });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_FETCH_ERROR
        });
    }
};


exports.addProduct = async (req, res) => {
    try {
        const {
            productName,
            description,
            brand,
            category,
            regularPrice,
            salesPrice,
            quantity,
            color,
            status,
            
        } = req.body;

        if (!productName || !description || !brand || !category || !regularPrice || !salesPrice || !color) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.PRODUCT_REQUIRED_FIELDS
            });
        }

           
        
     
        if (!req.files || req.files.length < 3) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.PRODUCT_IMAGES_REQUIRED
            });
        }

        const productImages = req.files.map(file => file.path);

        const product = new Product({
            productName,
            description,
            brand,
            category,
            regularPrice: parseFloat(regularPrice),
            salesPrice: parseFloat(salesPrice),
            quantity: parseInt(quantity) || 0,
            color,
        
            productImage: productImages,
            status: status || 'Available'
        });

        await product.save();

        res.status(statusCodes.CREATED).json({
            success: true,
            message: messages.PRODUCT_ADD_SUCCESS
        });
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: err.message || messages.PRODUCT_ADD_ERROR
        });
    }
};


exports.editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }
            
        const oldProduct = await Product.findById(id);
        if (!oldProduct) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }
            let removed = [];
            if (req.body.removedImages) {
                if (Array.isArray(req.body.removedImages)) removed = req.body.removedImages;
                else if (typeof req.body.removedImages === 'string') {
                    try {
                        removed = JSON.parse(req.body.removedImages);
                    } catch (e) {
                        removed = [req.body.removedImages];
                    }
                }
            }

            const updateData = {};
            const allowed = ['productName','description','brand','category','regularPrice','salesPrice','quantity','color','status'];
            for (const key of allowed) {
                if (req.body[key] !== undefined) {
                    if (['regularPrice','salesPrice'].includes(key)) updateData[key] = parseFloat(req.body[key]) || 0;
                    else if (['quantity'].includes(key)) updateData[key] = parseInt(req.body[key]) || 0;
                    else updateData[key] = req.body[key];
                }
            }

            const existingImages = Array.isArray(oldProduct.productImage) ? oldProduct.productImage.slice() : [];

            const removedSet = new Set(removed);
            const remainingImages = existingImages.filter(img => !removedSet.has(img));

            for (const img of existingImages) {
                if (removedSet.has(img)) {
                    try {
                        const publicId = img.split('/').pop().split('.')[0];
                        await cloudinary.uploader.destroy(publicId);
                    } catch (e) {
                        console.warn('Failed to delete image from cloudinary:', img, e.message || e);
                    }
                }
            }
        
            const newImagePaths = req.files?.length > 0 ? req.files.map(f => f.path) : [];
            const finalImages = [...remainingImages, ...newImagePaths];

            if (finalImages.length < 3) {
                return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.PRODUCT_MIN_IMAGES });
            }

            updateData.productImage = finalImages;

            const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

            res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_UPDATE_SUCCESS });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: err.message || messages.PRODUCT_UPDATE_ERROR
        });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

        for (let imageUrl of product.productImage) {
            const publicId = imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(publicId);
        }
    
        await Offer.deleteOne({ product: id });
        await Product.findByIdAndDelete(id);
    
        res.status(statusCodes.OK).json({
            success: true,
            message: messages.PRODUCT_DELETE_SUCCESS
        });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_DELETE_ERROR
        });
    }
};





exports.blockProduct = async (req, res) => {
  try {
    const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.INVALID_PRODUCT_ID });
    }
        const product = await Product.findByIdAndUpdate(id, { isBlocked: true, status: 'Blocked' }, { new: true });
        if (!product) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_FOUND });

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_BLOCK_SUCCESS, product });
    }

    return res.redirect(req.get('referer') || '/admin/products');
  } catch (err) {
    console.error('Error blocking product:', err);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.PRODUCT_BLOCK_ERROR });
    }
        return res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.PRODUCT_BLOCK_ERROR });
  }
};



exports.unblockProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.INVALID_PRODUCT_ID
            });
        }

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                isBlocked: false,
                status: 'Available'
            },
            { new: true }
        );

        if (!product) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.PRODUCT_NOT_FOUND
            });
        }

        res.status(statusCodes.OK).json({
            success: true,
            message: messages.PRODUCT_UNBLOCK_SUCCESS
        });
    } catch (err) {
        console.error('Error unblocking product:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.PRODUCT_UNBLOCK_ERROR
        });
    }
};

exports.setProductOffer = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.INVALID_PRODUCT_ID });
        }

        const offerRaw = req.body.offer ?? req.body.percentage;
        const startRaw = req.body.startDate;
        const endRaw = req.body.endDate;

        if (offerRaw == null || !startRaw || !endRaw) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: 'Offer percentage and start/end dates are required' });
        }

        const percentage = Number(offerRaw);
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: 'Offer must be a number between 0 and 100' });
        }

        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);
        if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: 'Invalid start or end date' });
        }

        let offerDoc = await Offer.findOne({ product: id
            ,offerType: 'product'
         });
        if (offerDoc) {
            offerDoc.percentage = Math.round(percentage);
            offerDoc.startDate = startDate;
            offerDoc.endDate = endDate;
            offerDoc.isActive = true;
            await offerDoc.save();
        } else {
            offerDoc = new Offer({
                offerType: 'product',
                product: id,
                percentage: Math.round(percentage),
                startDate,
                endDate,
                isActive: true
            });
            await offerDoc.save();
        }
        await Product.findByIdAndUpdate(id, { offer: offerDoc._id });

        return res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_UPDATE_SUCCESS, offer: offerDoc });
    } catch (err) {
        console.error('Error setting product offer:', err);
        return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.PRODUCT_UPDATE_ERROR });
    }
};

exports.removeProductOffer = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(statusCodes.BAD_REQUEST).json({ success: false, message: messages.INVALID_PRODUCT_ID });
        }

        await Offer.findOneAndDelete({ product: id });
        const product = await Product.findByIdAndUpdate(id, { offer: null }, { new: true });
        if (!product) return res.status(statusCodes.NOT_FOUND).json({ success: false, message: messages.PRODUCT_NOT_FOUND });

        return res.status(statusCodes.OK).json({ success: true, message: messages.PRODUCT_UPDATE_SUCCESS });
    } catch (err) {
        console.error('Error removing product offer:', err);
        return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.PRODUCT_UPDATE_ERROR });
    }
};

exports.editProductOffer = async (req, res) =>{
    try {

        const { id } = req.params;

        const {percentage,startDate,endDate} = req.body;

        const offer = await Offer.findOne({
            product: id,
            offerType:'product'
        })

        if(!offer){
            return res.status(404).json({
                success:false,
                message:"offer not found"
            })
        }

        offer.percentage = percentage;
        offer.startDate = new Date(startDate);
        offer.endDate = new Date(endDate);

        await offer.save()

        res.json({
            success:true,
            message: "offer update successfully"
        })

    }catch(err){
        console.error('Error editing product offer:',err);
        return res.status(statusCodes.INTERNAL_ERROR).json({ success: false, message: messages.PRODUCT_UPDATE_ERROR})
;    }
}

