module.exports = {
  // Signup / OTP
  ALL_FIELDS_REQUIRED: 'All fields are required',
  PASSWORD_MISMATCH: 'Passwords do not match',
  USER_ALREADY_EXISTS: 'User with this email already exists',
  ERROR_SENDING_EMAIL: 'Error sending email',
  SIGNUP_ERROR: 'An error occurred during signup',

  // OTP / Verification
  SESSION_EXPIRED: 'Session expired. Please signup again',
  INVALID_OTP: 'Invalid OTP, please try again',
  VERIFY_ERROR: 'An error occurred during verification',
  OTP_RESENT_SUCCESS: 'OTP resent successfully',
  OTP_RESEND_FAILED: 'Failed to resend OTP',

  // Auth / Login
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_BLOCKED: 'Your account has been blocked. Please contact administrator.',
  GOOGLE_ACCOUNT: 'This account was created with Google. Please login with Google.',
  LOGIN_ERROR: 'An error occurred during login',

  // General / Auth
  AUTH_REQUIRED: 'Authentication required',
  LOGOUT_ERROR: 'Error during logout',
  SERVER_ERROR: 'Server error',

  // Product related
  PRODUCTS_LOAD_ERROR: 'Error loading products',
  PRODUCT_SEARCH_ERROR: 'Error performing search',
  PRODUCT_NOT_FOUND: 'Product not found or unavailable',

  // Profile / Password / Address
  NO_ACCOUNT_FOUND: 'No account with that email found.',
  FORGOT_PASSWORD_SESSION_EXPIRED: 'Session expired. Please try again.',
  OTP_EXPIRED: 'OTP expired. Please resend.',
  OTP_RESENT: 'OTP resent!',
  NO_FILE_UPLOADED: 'No file uploaded',
  USER_NOT_FOUND: 'User not found',
  PROFILE_IMAGE_UPDATED: 'Profile image updated',
  PROFILE_UPDATE_SUCCESS: 'Profile updated successfully!',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered!',
  ADDRESS_UPDATED: 'Address updated successfully!',
  ADDRESS_ADDED: 'Address added successfully!',
  ADDRESS_DELETE_SUCCESS: 'Address deleted successfully',
  ADDRESS_SAVE_FAILED: 'Failed to save address. Please try again.',
  ADDRESS_DELETE_FAILED: 'Failed to delete address',
  INVALID_ADDRESS: 'Invalid address',
  NOT_AUTHENTICATED: 'Not authenticated',
  OLD_PASSWORD_INCORRECT: 'Old password incorrect',
  PASSWORD_RULES: 'Password must be 8+ chars, contain upper, lower case and a number',
  PASSWORD_CHANGED_SUCCESS: 'Password changed successfully!',

  // Cart related
  CART_LOAD_ERROR: 'Error loading cart',
  AUTH_REQUIRED: 'Authentication required',
  PRODUCT_ID_REQUIRED: 'productId required',
  PRODUCT_UNAVAILABLE: 'Product is unavailable',
  PRODUCT_ALREADY_IN_CART: 'Product already in cart',
  ADDED_TO_CART_SUCCESS: 'Added to cart successfully',
  CART_CONCURRENCY_ERROR: 'Cart concurrency error, please try again',
  ADD_TO_CART_ERROR: 'Error adding to cart',
  CART_NOT_FOUND: 'Cart not found',
  PRODUCT_NOT_IN_CART: 'Product not found in cart',
  PRODUCT_NOT_FOUND: 'Product not found',
  CANNOT_INCREASE_QUANTITY: 'You’ve reached the maximum available quantity for this product.',
  MIN_QUANTITY_ERROR: 'Minimum quantity is 1',
  UPDATE_QUANTITY_ERROR: 'Error updating quantity',
  ITEM_NOT_IN_CART: 'Item not found in cart',
  ITEM_REMOVED_FROM_CART: 'Item removed from cart',
  REMOVE_ITEM_ERROR: 'Error removing item',
  CART_MAXIMUX_ITEMS: 'You can select a maximum of 10 items per order. Please reduce the quantity to continue.',
  // Orders
  ORDERS_LOAD_ERROR: 'Failed to load orders',
  ORDER_DETAILS_LOAD_ERROR: 'Failed to load order details',
  DASHBOARD_LOAD_ERROR: 'Failed to load dashboard',
  ORDER_NOT_FOUND: 'Order not found',
  CANCEL_ONLY_PENDING: 'Only pending orders can be cancelled',
  ORDER_CANCELLED_SUCCESS: 'Order cancelled successfully',
  CANCELLATION_FAILED: 'Cancellation failed',
  RETURN_REASON_REQUIRED: 'Return reason is required',
  RETURN_NOT_ALLOWED: 'Cannot request return for this order',
  RETURN_REQUEST_SUBMITTED: 'Return request submitted. Awaiting admin approval.',
  RETURN_REQUEST_FAILED: 'Return request failed',
  INVOICE_GENERATION_FAILED: 'Failed to generate invoice',
  ITEM_NOT_FOUND: 'Item not found',
  ORDER_CANNOT_CANCEL_STAGE: 'Order cannot be cancelled at this stage',
  ITEM_ALREADY_CANCELLED: 'Item already cancelled',
  CANNOT_CANCEL_AFTER_SHIPPED: 'Cannot cancel item after it is shipped/delivered',
  ITEM_CANCELLED_SUCCESS: 'Item cancelled successfully',
  RETURN_ALREADY_REQUESTED: 'Return already requested or completed for this item',
  ONLY_DELIVERED_CAN_RETURN: 'Only delivered items can be returned',

  // Checkout / Place order
  CHECKOUT_LOAD_ERROR: 'Failed to load checkout',
  CART_EMPTY: 'Cart is empty',
  OUT_OF_STOCK: 'Out of stock',
  STOCK_CHANGED_TRY_AGAIN: 'Stock changed. Try again.',
  PLEASE_ADD_DELIVERY_ADDRESS: 'Please add a delivery address',
  ORDER_FAILED: 'Order failed. Try again.',
  ORDER_PLACE_FAILED: 'Failed to place order',
  INVALID_PAYMENT_METHOD: "Invalid payment method selected. Please choose a valid payment option.",

  // Wishlist
  WISHLIST_LOAD_ERROR: 'Unable to load wishlist',
  WISHLIST_ALREADY: 'Already in wishlist',
  WISHLIST_ADDED: 'Added to wishlist',
  WISHLIST_ADD_ERROR: 'Error adding to wishlist',
  ITEM_NOT_IN_WISHLIST: 'Item not found in wishlist',
  WISHLIST_REMOVED: 'Removed from wishlist',
  WISHLIST_REMOVE_ERROR: 'Error removing from wishlist',

  // Categories (admin)
  CATEGORY_LOAD_ERROR: 'Error loading categories',
  CATEGORY_NAME_DESC_REQUIRED: 'Category name and description cannot be empty',
  CATEGORY_EXISTS: 'Category already exists',
  CATEGORY_ADD_SUCCESS: 'Category added successfully',
  CATEGORY_ADD_ERROR: 'Error adding category',
  CATEGORY_NOT_FOUND: 'Category not found',
  CATEGORY_UPDATE_SUCCESS: 'Category updated successfully',
  CATEGORY_UPDATE_ERROR: 'Error updating category',
  CATEGORY_DELETE_SUCCESS: 'Category deleted successfully',
  CATEGORY_DELETE_ERROR: 'Error deleting category'
};

// Customers (admin)
module.exports.CUSTOMERS_LOAD_ERROR = 'Error loading customers';
module.exports.CUSTOMER_SEARCH_ERROR = 'Error searching customers';
module.exports.CUSTOMER_NOT_FOUND = 'Customer not found';
module.exports.CUSTOMER_BLOCK_ERROR = 'Error blocking customer';
module.exports.CUSTOMER_UNBLOCK_ERROR = 'Error unblocking customer';
// Products (admin)
module.exports.INVALID_PRODUCT_ID = 'Invalid product ID';
module.exports.PRODUCT_FETCH_ERROR = 'Error fetching product details';
module.exports.PRODUCT_REQUIRED_FIELDS = 'Please fill all required fields';
module.exports.PRODUCT_IMAGES_REQUIRED = 'Please upload at least 3 images';
module.exports.PRODUCT_MIN_IMAGES = 'Product must have at least 3 images';
module.exports.PRODUCT_ADD_SUCCESS = 'Product added successfully';
module.exports.PRODUCT_ADD_ERROR = 'Error adding product';
module.exports.PRODUCT_UPDATE_SUCCESS = 'Product updated successfully';
module.exports.PRODUCT_UPDATE_ERROR = 'Error updating product';
module.exports.PRODUCT_DELETE_SUCCESS = 'Product deleted successfully';
module.exports.PRODUCT_DELETE_ERROR = 'Error deleting product';
module.exports.PRODUCT_BLOCK_SUCCESS = 'Product blocked successfully';
module.exports.PRODUCT_BLOCK_ERROR = 'Error blocking product';
module.exports.PRODUCT_UNBLOCK_SUCCESS = 'Product unblocked successfully';
module.exports.PRODUCT_UNBLOCK_ERROR = 'Error unblocking product';
// Orders (admin)
module.exports.REQUESTS_LOAD_ERROR = 'Error loading requests';
module.exports.STATUS_REQUIRED = 'Status is required';
module.exports.INVALID_CURRENT_STATUS = 'Invalid current status';
module.exports.INVALID_TRANSITION = 'Invalid status transition';
module.exports.RETURN_ONLY_AFTER_REQUEST = 'Can only mark as Returned after a Return Request is made.';
module.exports.STATUS_UPDATE_SUCCESS = 'Status updated successfully';
module.exports.FULL_ORDER_REQUEST_APPROVED = 'Full order request approved';
module.exports.REQUEST_REJECTED = 'Request rejected';
module.exports.ITEM_REQUEST_APPROVED = 'Item request approved';
module.exports.ITEM_REQUEST_REJECTED = 'Item request rejected';
// Inventory (admin)
module.exports.INVENTORY_LOAD_ERROR = 'Failed to load inventory';
module.exports.INVENTORY_INVALID_QUANTITY = 'Invalid quantity';
module.exports.INVENTORY_UPDATE_FAILED = 'Update failed';
module.exports.INVENTORY_UPDATE_SUCCESS = 'Inventory updated successfully';
 