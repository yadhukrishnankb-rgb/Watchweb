const Brand = require('../../models/brandSchema');
const messages = require('../../constants/messages');
const statusCodes = require('../../constants/statusCodes');


exports.getBrandPage = async (req, res) =>{
    try {
        const brands = await Brand.find({}).lean();
        res.render('admin/brands', { brands});
    } catch (err) {
        console.error('Error fetching brands:', err)
        res.status(statusCodes.INTERNAL_ERROR).render('error', { message: messages.BRAND_LOAD_ERROR});
    }
}


exports.addBrand = async (req, res)=> {
    try {
        let { name } = req.body;

        if (typeof name !== 'string') {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: "Brand name is required"
            });
        }

        name = name.trim();

        if (!name) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: "Brand name is required"
            });
        }

        const existingBrand = await Brand.findOne({ name: { $regex: `^${name}$`, $options: 'i'}});

        if (existingBrand) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: "Brand already exists"
            })
        }        

        await Brand.create({ name });

        res.json({
            success: true,
            message: "Brand added successfully"
        })

    }catch (err) {

        console.error('Error adding brand:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: "Error adding brand"
        })
    }
}

exports.editBrand = async (req,res) =>{
    try {
        const { id } = req.params;
        let { name } = req.body;

        name = name.trim();

        const existingBrand = await Brand.findOne({
            name: { $regex: `^${name}$`, $options: 'i'},
            _id: { $ne: id}
        })

        if(existingBrand) {
            return res.status(statusCodes.BAD_REQUEST).json({
                success: false,
                message: "Another brand with the same name already exists"
            })
        }

        await Brand.findByIdAndUpdate(id, { name });
        
        res.json({
            success: true,
            message: "Brand updated successfully"
        })

    }catch (err) {
        console.error('Error editing brand:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: "Error editing brand"
        })
    }
}


exports.toggleBrand = async (req, res) =>{
    try {
        const { id } = req.params;

        const brand = await Brand.findById(id);
        if (!brand) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: "Brand not found"
            });
        }

        brand.isBlocked = !brand.isBlocked;
        await brand.save();

        res.json({
            success: true,
            message: brand.isBlocked ? "Brand blocked successfully" : "Brand unblocked successfully"
        });

    }catch (err) {
        console.error('Error toggling brand:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: "Error toggling brand"
        });
    }
}

exports.deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedBrand = await Brand.findByIdAndDelete(id);

        if (!deletedBrand) {
            return res.status(statusCodes.NOT_FOUND).json({
                success: false,
                message: "Brand not found"
            });
        }

        res.json({
            success: true,
            message: "Brand deleted successfully"
        });
    } catch (err) {
        console.error('Error deleting brand:', err);
        res.status(statusCodes.INTERNAL_ERROR).json({
            success: false,
            message: "Error deleting brand"
        });
    }
}