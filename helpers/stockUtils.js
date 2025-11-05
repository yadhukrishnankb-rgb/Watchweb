/**
 * Returns a human-readable stock object used by the view.
 * @param {Object} product – Mongoose document (with virtuals)
 */
function getStockInfo(product) {
  const status = product.stockStatus;

  const messages = {
    BLOCKED:    { text: 'Blocked by Admin',   css: 'text-red-600' },
    SOLD_OUT:   { text: 'Sold Out',          css: 'text-red-600' },
    LOW_STOCK:  { text: `Only ${product.quantity} left!`, css: 'text-orange-600' },
    IN_STOCK:   { text: `In Stock (${product.quantity} available)`, css: 'text-green-600' }
  };

  const info = messages[status] || messages.IN_STOCK;
  return {
    status,
    message: info.text,
    cssClass: info.css,
    canPurchase: ['IN_STOCK', 'LOW_STOCK'].includes(status)
  };
}

module.exports = { getStockInfo };