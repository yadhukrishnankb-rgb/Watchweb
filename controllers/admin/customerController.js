const Customer = require('../../models/userSchema');

// Get all customers
exports.getCustomers = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = {}; // modify if you want filters

        const [totalCustomers, customers] = await Promise.all([
    Customer.countDocuments(query),
    Customer.find(query)
        .select('name email isBlocked createdAt')
        // newest first (createdAt desc), tie-breaker by _id desc for deterministic order
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
]);

        const formattedCustomers = customers.map(customer => ({
            _id: customer._id,
            name: customer.name,
            email: customer.email,
            status: customer.isBlocked ? 'blocked' : 'active',
            createdAt: customer.createdAt
        }));

        const totalPages = Math.max(Math.ceil(totalCustomers / limit), 1);
        // generate pages array for view
        const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

        res.render('admin/customers', {
            customers: formattedCustomers,
            currentPage: page,
            totalPages,
            pages,
            limit,
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
        const searchQuery = req.body.query || '';
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = {
            $or: [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } }
            ]
        };


const [totalCustomers, customers] = await Promise.all([
    Customer.countDocuments(query),
    Customer.find(query)
        .select('name email isBlocked createdAt')
        // newest first (createdAt desc), tie-breaker by _id desc
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
]);


        const formattedCustomers = customers.map(customer => ({
            _id: customer._id,
            name: customer.name,
            email: customer.email,
            status: customer.isBlocked ? 'blocked' : 'active',
            createdAt: customer.createdAt
        }));

        const totalPages = Math.max(Math.ceil(totalCustomers / limit), 1);
        const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

        res.render('admin/customers', {
            customers: formattedCustomers,
            currentPage: page,
            totalPages,
            pages,
            limit,
            searchQuery
        });
    } catch (err) {
        console.error('Error searching customers:', err);
        res.status(500).render('error', { message: 'Error searching customers' });
    }
};

// Block customer
// ...existing code...
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

        // preserve page and search query when redirecting if provided
        const redirectPage = req.query.page ? `?page=${req.query.page}` : '';
        const redirectSearch = req.query.search ? `${redirectPage ? '&' : '?'}search=${encodeURIComponent(req.query.search)}` : '';
        res.redirect('/admin/customers' + redirectPage + (req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : ''));
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

        const redirectPage = req.query.page ? `?page=${req.query.page}` : '';
        res.redirect('/admin/customers' + redirectPage + (req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : ''));
    } catch (err) {
        console.error('Error unblocking customer:', err);
        res.status(500).render('error', { message: 'Error unblocking customer' });
    }
};
