const Coupon = require('../../models/couponSchema');

// List all coupons

const getCoupons = async (req, res) =>{
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1}).lean();
        res.render('admin/coupons',{coupons});
    } catch (err) {
        console.error("Coupon Fetch Error:", err);
        res.status(500).json({ success: false, message: 'Error fetching coupons'})
    }
}

const createCoupon = async (req, res) => {
    try {
       
        const {
            code, discountType, discountValue, minAmount, 
            maxDiscount, expiryDate, usageLimit, userUsageLimit
        } = req.body;

        const existing = await Coupon.findOne({ code: code.toUpperCase()});

        if (existing) {
            return res.status(400).json({ success: false, message: 'coupon code already exists'})
        }

        const coupon = new Coupon({
            code: code.toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            minAmount: Number(minAmount),
            maxDiscount: maxDiscount ? Number(maxDiscount) : null,
            expiryDate: new Date(expiryDate),
            usageLimit: usageLimit ? Number(usageLimit) : null,
            userUsageLimit: userUsageLimit ? Number(userUsageLimit) : 1
        });

        await coupon.save();

        res.json({success: true, message: 'coupon created successfully'});

    }catch(err) {

        console.error('create coupon error:', err);
        res.status(500).json({ success: false, message: 'Error creating coupon'})

    }
}

const editCoupon = async (req,res) =>{

    try{
     
        const { id } = req.params;
        const { discountType, discountValue, minAmount, maxDiscount, expiryDate, usageLimit, userUsageLimit } = req.body;

        const coupon = await Coupon.findById(id);
        if(!coupon) {
            return res.status(404).json({success: false, message: 'Coupon not found'})
        }
       
        coupon.discountType = discountType;
        coupon.discountValue = Number(discountValue);
        coupon.minAmount = Number(minAmount);
        coupon.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
        coupon.expiryDate = new Date(expiryDate);
        coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
        coupon.userUsageLimit = userUsageLimit ? Number(userUsageLimit) : 1;

        await coupon.save();

        res.json({success:true, message:'coupon updated'});

    }catch(err){
        console.error('Edit coupon error', err);
        res.status(500).json({success:false, message: 'Failed to update coupon'})

    }

}

const deleteCoupon = async (req, res) => {
    try {

        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        res.json({ success: true, message: 'coupon deleted'});

    } catch (err) {
        console.error('Delete coupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete coupon'})

    }
}

const toggleCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        
        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({ success: true, message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
        console.error('Toggle coupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle coupon' });
    }
}


module.exports = {
    getCoupons,
    createCoupon,
    editCoupon,
    deleteCoupon,
    toggleCoupon
   
}

