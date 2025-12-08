const Category = require('../../models/categorySchema');


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
            .select('name description createdAt')
            .sort({createdAt: -1,_id: -1})
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
        res.status(500).render('admin/error', { message: 'Error loading categories' });
    }
};


// Add new category


exports.addCategory = async (req, res) => {
    try {
        let { name, description } = req.body;
        
        // Trim whitespace and validate
        name = name.trim();
        description = description.trim();

        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: 'Category name and description cannot be empty'
            });
        }

        // Check if category already exists (case insensitive)
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });
        
        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category already exists'
            });
        }

        const category = new Category({ name, description });
        await category.save();

        res.json({
            success: true,
            message: 'Category added successfully'
        });
    } catch (err) {
        console.error('Error adding category:', err);
        res.status(500).json({
            success: false,
            message: 'Error adding category'
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
            return res.status(400).json({
                success: false,
                message: 'Category name already exists'
            });
        }

        const category = await Category.findByIdAndUpdate(
            id,
            { name, description },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.json({
            success: true,
            message: 'Category updated successfully'
        });
    } catch (err) {
        console.error('Error updating category:', err);
        res.status(500).json({
            success: false,
            message: 'Error updating category'
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
            return res.status(404).json({
                success: false,
                message: 'Category not found or already deleted'
            });
        }

        

        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({
            success: false,
            message: 'Error deleting category'
        });
    }
};