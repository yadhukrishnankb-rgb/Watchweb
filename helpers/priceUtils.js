const getEffectivePrice = (product, categoryData = null) => {
  if (!product) return 0;

  const base = typeof product.salesPrice === 'number'
    ? product.salesPrice
    : (product.price || product.regularPrice || 0);

  const nowDate = new Date();

  let productDiscount = 0;
  let categoryDiscount = 0;

  //  Product-level offer
  if (product.offer && product.offer.isActive) {
    const po = product.offer;

    if ((!po.startDate || po.startDate <= nowDate) &&
        (!po.endDate || po.endDate >= nowDate)) {

      if (typeof po.discountValue === 'number') {
        if (po.discountType === 'percentage') {
          productDiscount = po.discountValue;
        } else if (base > 0) {
          productDiscount = (po.discountValue / base) * 100;
        }
      } else if (typeof po.percentage === 'number') {
        productDiscount = po.percentage;
      }
    }
  }

  //  Category-level offer
  if (categoryData && categoryData.offer && categoryData.offer.isActive) {
    const co = categoryData.offer;

    if ((!co.startDate || co.startDate <= nowDate) &&
        (!co.endDate || co.endDate >= nowDate)) {

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

  //  Apply the highest discount
  const discountPercent = Math.max(productDiscount, categoryDiscount);

  //  Legacy numeric productOffer
  if (discountPercent === 0 && product.productOffer && product.productOffer > 0) {
    return Math.round(base * (1 - product.productOffer / 100) * 100) / 100;
  }

  if (discountPercent > 0) {
    return Math.round(base * (1 - discountPercent / 100) * 100) / 100;
  }

  return base;
};

module.exports = { getEffectivePrice };