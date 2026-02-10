const Category = require('../../models/categorySchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');


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
            .select('name description createAt')
            .sort({createAt: -1,_id: -1})
            .skip(skip)
            .limit(limit)
            
        ])

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

//         const nameRegex = /^[A-Za-z\s]+$/;

// if (!nameRegex.test(name)) {
//     return res.status(statusCodes.BAD_REQUEST).json({
//         success: false,
//         message: "Category name must contain only letters"
//     });
// }

        
        // Trim whitespace and validate
        name = name.trim();
        description = description.trim();

        if (!name || !description) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: messages.CATEGORY_NAME_DESC_REQUIRED
            });
        }

        

        // Check if category already exists (case insensitive)
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
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
        const { name, description } = req.body;

        // Check if new name already exists for different category
        const existingCategory = await Category.findOne({ 
            name, 
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