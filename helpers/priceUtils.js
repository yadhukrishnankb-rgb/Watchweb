// const getEffectivePrice = (product, categoryData = null) => {
//   if (!product) return 0;

//   const base = typeof product.salesPrice === 'number'
//     ? product.salesPrice
//     : (product.price || product.regularPrice || 0);

//   const nowDate = new Date();

//   let productDiscount = 0;
//   let categoryDiscount = 0;

//   //  Product-level offer
//   if (product.offer && product.offer.isActive) {
//     const po = product.offer;

//     if ((!po.startDate || po.startDate <= nowDate) &&
//         (!po.endDate || po.endDate >= nowDate)) {

//       if (typeof po.discountValue === 'number') {
//         if (po.discountType === 'percentage') {
//           productDiscount = po.discountValue;
//         } else if (base > 0) {
//           productDiscount = (po.discountValue / base) * 100;
//         }
//       } else if (typeof po.percentage === 'number') {
//         productDiscount = po.percentage;
//       }
//     }
//   }

//   //  Category-level offer
//   if (categoryData && categoryData.offer && categoryData.offer.isActive) {
//     const co = categoryData.offer;

//     if ((!co.startDate || co.startDate <= nowDate) &&
//         (!co.endDate || co.endDate >= nowDate)) {

//       if (typeof co.percentage === 'number') {
//         categoryDiscount = co.percentage;
//       } else if (typeof co.discountValue === 'number') {
//         if (co.discountType === 'percentage') {
//           categoryDiscount = co.discountValue;
//         } else if (base > 0) {
//           categoryDiscount = (co.discountValue / base) * 100;
//         }
//       }
//     }
//   }

//   //  Apply the highest discount
//   const discountPercent = Math.max(productDiscount, categoryDiscount);

//   //  Legacy numeric productOffer
//   if (discountPercent === 0 && product.productOffer && product.productOffer > 0) {
//     return Math.round(base * (1 - product.productOffer / 100) * 100) / 100;
//   }

//   if (discountPercent > 0) {
//     return Math.round(base * (1 - discountPercent / 100) * 100) / 100;
//   }

//   return base;
// };

// /**
//  * Calculate offer details including percentage, dates, and source
//  * Applies the MAXIMUM discount from product or category offer
//  * Prioritizes category offer when equal or higher
//  * 
//  * @param {Object} product - The product object with offer and category
//  * @returns {Object} Offer details with offerPercent, offerStart, offerEnd, offerSource
//  */
// const getOfferDetails = (product) => {
//   const result = {
//     offerPercent: 0,
//     offerStart: null,
//     offerEnd: null,
//     offerSource: null
//   };

//   if (!product) return result;

//   const nowDate = new Date();
//   let productDiscount = 0;
//   let categoryDiscount = 0;

//   // Check product offer
//   if (product.offer && product.offer.percentage > 0 && product.offer.isActive) {
//     if ((!product.offer.startDate || product.offer.startDate <= nowDate) && 
//         (!product.offer.endDate || product.offer.endDate >= nowDate)) {
//       productDiscount = product.offer.percentage;
//     }
//   }

//   // Check category offer
//   if (product.category && product.category.offer && product.category.offer.percentage > 0 && product.category.offer.isActive) {
//     if ((!product.category.offer.startDate || product.category.offer.startDate <= nowDate) && 
//         (!product.category.offer.endDate || product.category.offer.endDate >= nowDate)) {
//       categoryDiscount = product.category.offer.percentage;
//     }
//   }

//   // Apply MAXIMUM discount with category prioritization when equal
//   result.offerPercent = Math.max(productDiscount, categoryDiscount);

//   if (result.offerPercent > 0) {
//     // Determine which offer source provides the maximum discount
//     if (categoryDiscount > productDiscount) {
//       // Category offer is higher
//       result.offerStart = product.category.offer.startDate;
//       result.offerEnd = product.category.offer.endDate;
//       result.offerSource = 'category';
//     } else if (productDiscount > categoryDiscount) {
//       // Product offer is higher
//       result.offerStart = product.offer.startDate;
//       result.offerEnd = product.offer.endDate;
//       result.offerSource = 'product';
//     } else if (categoryDiscount === productDiscount && categoryDiscount > 0) {
//       // Both are equal - prioritize category offer
//       result.offerStart = product.category.offer.startDate;
//       result.offerEnd = product.category.offer.endDate;
//       result.offerSource = 'category';
//     }
//   }

//   return result;
// };

// module.exports = { getEffectivePrice, getOfferDetails };



//--------------

// helpers/priceUtils.js

const getEffectivePrice = (product, categoryData = null) => {
  if (!product) return 0;

  const base = typeof product.salesPrice === 'number'
    ? product.salesPrice
    : (product.price || product.regularPrice || 0);

  const nowDate = new Date();

  let productDiscount = 0;
  let categoryDiscount = 0;

  // Product-level offer
  if (product.offer && product.offer.isActive) {
    const po = product.offer;
    const isValid = (!po.startDate || po.startDate <= nowDate) &&
                    (!po.endDate || po.endDate >= nowDate);

    if (isValid) {
      if (typeof po.percentage === 'number') {
        productDiscount = po.percentage;
      } else if (typeof po.discountValue === 'number') {
        if (po.discountType === 'percentage') {
          productDiscount = po.discountValue;
        } else if (base > 0) {
          productDiscount = (po.discountValue / base) * 100;
        }
      }
    }
  }

  // Category-level offer
  if (categoryData && categoryData.offer && categoryData.offer.isActive) {
    const co = categoryData.offer;
    const isValid = (!co.startDate || co.startDate <= nowDate) &&
                    (!co.endDate || co.endDate >= nowDate);

    if (isValid) {
      if (typeof co.percentage === 'number') {
        categoryDiscount = co.percentage;
      } else if (typeof co.discountValue === 'number') {
        if (co.discountType === 'percentage') {
          categoryDiscount = co.discountValue;
        } else if (base > 0) {
          categoryDiscount = (co.discountValue / base) * 100;
        }
      }
    }
  }

  // Highest discount wins (category wins if equal)
  const discountPercent = Math.max(productDiscount, categoryDiscount);

  if (discountPercent > 0) {
    return Math.round(base * (1 - discountPercent / 100) * 100) / 100;
  }

  // Legacy support
  if (product.productOffer && product.productOffer > 0) {
    return Math.round(base * (1 - product.productOffer / 100) * 100) / 100;
  }

  return base;
};

/**
 * Returns offer details with the HIGHEST discount
 * Category offer wins when it is equal or higher than product offer
 */
const getOfferDetails = (product) => {
  const result = {
    offerPercent: 0,
    offerStart: null,
    offerEnd: null,
    offerSource: null,
    effectivePrice: 0
  };

  if (!product) return result;

  const nowDate = new Date();
  let productDiscount = 0;
  let categoryDiscount = 0;

  const basePrice = typeof product.salesPrice === 'number'
    ? product.salesPrice
    : (product.price || product.regularPrice || 0);

  // Helper function to safely get discount percentage from any offer
  const getDiscountFromOffer = (offer) => {
    if (!offer || !offer.isActive) return 0;

    const isValidDate = (!offer.startDate || offer.startDate <= nowDate) &&
                        (!offer.endDate || offer.endDate >= nowDate);
    if (!isValidDate) return 0;

    if (typeof offer.percentage === 'number' && offer.percentage > 0) {
      return offer.percentage;
    }

    if (typeof offer.discountValue === 'number') {
      if (offer.discountType === 'percentage') {
        return offer.discountValue;
      } else if (basePrice > 0) {
        return (offer.discountValue / basePrice) * 100;
      }
    }
    return 0;
  };

  // Get product discount
  if (product.offer) {
    productDiscount = getDiscountFromOffer(product.offer);
  }

  // Get category discount
  if (product.category && product.category.offer) {
    categoryDiscount = getDiscountFromOffer(product.category.offer);
  }

  // === HIGHEST OFFER LOGIC ===
  result.offerPercent = Math.max(productDiscount, categoryDiscount);

  if (result.offerPercent > 0) {
    // Category wins if it is higher OR equal
    if (categoryDiscount >= productDiscount) {
      result.offerSource = 'category';
      if (product.category && product.category.offer) {
        result.offerStart = product.category.offer.startDate;
        result.offerEnd = product.category.offer.endDate;
      }
    } else {
      result.offerSource = 'product';
      if (product.offer) {
        result.offerStart = product.offer.startDate;
        result.offerEnd = product.offer.endDate;
      }
    }
  }

  // Calculate final price after highest discount
  result.effectivePrice = result.offerPercent > 0 
    ? Math.round(basePrice * (1 - result.offerPercent / 100) * 100) / 100 
    : basePrice;

  return result;
};

module.exports = { getEffectivePrice, getOfferDetails };