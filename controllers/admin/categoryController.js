const Category = require('../../models/categorySchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');
const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        // Add isListed: true to only show non-deleted categories
        const query = {
            isListed: true,
            ...(searchQuery && {
                name: { $regex: searchQuery, $options: 'i' }
            })
        };

        

        const [totalCategories, categories] = await Promise.all([
            Category.countDocuments(query),
            Category.find(query)
            .populate('offer')
            .select('name description offer isListed createdAt')
            .sort({createdAt: -1,_id: -1})
            .skip(skip)
            .limit(limit)
        ]);

        res.render('admin/categories', {
            categories,
            currentPage: page,
            totalPages: Math.ceil(totalCategories / limit),
            searchQuery
        });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(statusCodes.INTERNAL_ERROR).render('admin/error', { message: messages.CATEGORY_LOAD_ERROR });
    }
};

// // Add new category
exports.addCategory = async (req, res) => {
    try {

        let { name, description } = req.body;
        
        // Trim whitespace and validate
        name = (name || '').toString().trim();
        description = (description || '').toString().trim();

        if (!name || !description) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CATEGORY_NAME_DESC_REQUIRED
            });
        }

        // Check if category already exists (case insensitive)
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') }
        });
        
        if (existingCategory) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CATEGORY_EXISTS
            });
        }

        const category = new Category({ name, description });
        await category.save();

        res.json({
            success: true,
            message: messages.CATEGORY_ADD_SUCCESS
        });
    } catch (err) {
        console.error('Error adding category:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.CATEGORY_ADD_ERROR
        });
    }
};




// Edit category
exports.editCategory = async (req, res) => {
    try {
        const { id } = req.params;
        let { name, description } = req.body;

        name = (name || '').toString().trim();
        description = (description || '').toString().trim();

        if (!name || !description) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CATEGORY_NAME_DESC_REQUIRED
            });
        }

        // Check if new name already exists for different category (case insensitive)
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
            _id: { $ne: id }
        });
        
        if (existingCategory) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CATEGORY_EXISTS
            });
        }

        const category = await Category.findByIdAndUpdate(
            id,
            { name, description },
            { new: true }
        );

        if (!category) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.CATEGORY_NOT_FOUND
            });
        }

        res.json({
            success: true,
            message: messages.CATEGORY_UPDATE_SUCCESS
        });
    } catch (err) {
        console.error('Error updating category:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.CATEGORY_UPDATE_ERROR
        });
    }
};


exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

    
        
        const category = await Category.findOneAndUpdate(
            { _id: id, isListed: true },
            { isListed: false },
            { new: true }
        );

        

        if (!category) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: messages.CATEGORY_NOT_FOUND
            });
        }
    
        

        res.status(statusCodes.OK).json({
            success: true,
            message: messages.CATEGORY_DELETE_SUCCESS
        });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: messages.CATEGORY_DELETE_ERROR
        });
    }
};

exports.setCategoryOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const { percentage, startDate, endDate } = req.body;

        if (percentage === undefined || !startDate || !endDate) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: 'Percentage and dates are required'
            });
        }

        const pct = Number(percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: 'Percentage must be a number between 0 and 100'
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start) || isNaN(end) || start > end) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: 'Invalid start or end date'
            });
        }

        // upsert category offer document
        let offerDoc = await Offer.findOne({ category: id, offerType: 'category' });
        if (offerDoc) {
            offerDoc.percentage = Math.round(pct);
            offerDoc.startDate = start;
            offerDoc.endDate = end;
            offerDoc.isActive = true;
            await offerDoc.save();
        } else {
            offerDoc = new Offer({
                offerType: 'category',
                category: id,
                percentage: Math.round(pct),
                startDate: start,
                endDate: end,
                isActive: true
            });
            await offerDoc.save();
        }
        // link to category
        await Category.findByIdAndUpdate(id, { offer: offerDoc._id });

        res.json({
            success: true,
            message: 'Category offer updated successfully',
            offer: offerDoc
        });
    } catch (err) {
        console.error('Error updating category offer:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: 'Error updating category offer'
        });
    }
};

exports.editCategoryOffer = async (req,res) =>{

    try{

        const { id } = req.params;
        const { percentage, startDate, endDate} = req.body;

        const offer = await Offer.findOne({
            category: id,
            offerType: 'category'
        })

        if(!offer){
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            })
        }

        offer.percentage = percentage;
        offer.startDate = new Date(startDate)
        offer.endDate = new Date(endDate);

        await offer.save();

        res.json({
            success: true,
            message: "Offer updated successfully"
        });

    }catch(err){
        console.error(err)
        res.status(500).json({
            success: false,
            message: "Error updating offer"
        })

    }

}

exports.removeCategoryOffer = async (req, res) => {
    try {
        const { id } = req.params;

        // delete the offer document and clear reference
        await Offer.findOneAndDelete({ category: id, offerType: 'category' });
        await Category.findByIdAndUpdate(id, { offer: null });

        res.json({
            success: true,
            message: 'Category offer removed successfully'
        });
    } catch (err) {
        console.error('Error removing category offer:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: 'Error removing category offer'
        });
    }
};

