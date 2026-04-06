const offerPopulate = [
  { path: 'offer' },
  {
    path: 'category',
    populate: { path: 'offer' }
  }
];

module.exports = { offerPopulate };