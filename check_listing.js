const mongoose = require('mongoose');
require('dotenv').config();

async function checkListing() {
  try {
    await mongoose.connect(process.env.ATLASDB_URL);
    const Listing = require('./Models/listing');
    const listing = await Listing.findById('69d3b3413b86b292dd953d73');
    console.log('Listing found:', !!listing);
    if (listing) {
      console.log('Title:', listing.title);
      console.log('Location:', listing.location);
      console.log('Geometry:', listing.geometry);
      console.log('Coordinates:', listing.geometry?.coordinates);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkListing();
