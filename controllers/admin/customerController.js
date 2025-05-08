
const Customer = require('../../models/userSchema');

// Get all customers
exports.getCustomers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const totalCustomers = await Customer.countDocuments();
        const customers = await Customer.find()
            .select('name email isBlocked createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const formattedCustomers = customers.map(customer => ({
            _id: customer._id,
            name: customer.name,
            email: customer.email,
            status: customer.isBlocked ? 'blocked' : 'active',
            createdAt: customer.createdAt
        }));

        res.render('admin/customers', {
            customers: formattedCustomers,
            currentPage: page,
            totalPages: Math.ceil(totalCustomers / limit),
            searchQuery: ''
        });
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).render('error', { message: 'Error loading customers' });
    }
};

// Search customers
exports.searchCustomers = async (req, res) => {
    try {
        const searchQuery = req.body.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const query = {
            $or: [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } }
            ]
        };

        const [customers, totalCustomers] = await Promise.all([
            Customer.find(query)
                .select('name email isBlocked createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Customer.countDocuments(query)
        ]);

        const formattedCustomers = customers.map(customer => ({
            _id: customer._id,
            name: customer.name,
            email: customer.email,
            status: customer.isBlocked ? 'blocked' : 'active',
            createdAt: customer.createdAt
        }));

        res.render('admin/customers', {
            customers: formattedCustomers,
            currentPage: page,
            totalPages: Math.ceil(totalCustomers / limit),
            searchQuery
        });
    } catch (err) {
        console.error('Error searching customers:', err);
        res.status(500).render('error', { message: 'Error searching customers' });
    }
};

// Block customer
exports.blockCustomer = async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            { isBlocked: true },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        res.redirect('/admin/customers');
    } catch (err) {
        console.error('Error blocking customer:', err);
        res.status(500).render('error', { message: 'Error blocking customer' });
    }
};

// Unblock customer
exports.unblockCustomer = async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            { isBlocked: false },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        res.redirect('/admin/customers');
    } catch (err) {
        console.error('Error unblocking customer:', err);
        res.status(500).render('error', { message: 'Error unblocking customer' });
    }
};