const Listing = require("../Models/listing.js");
const asyncWrap = require("../public/utilities/asyncWrap.js");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const geocodingClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });

// Geocoding utility function
async function geocodeLocation(location, country) {
    try {
        const address = `${location}, ${country}`;
        const response = await geocodingClient
            .forwardGeocode({
                query: address,
                limit: 1
            })
            .send();

        if (response.body.features && response.body.features.length > 0) {
            const [lng, lat] = response.body.features[0].center;
            return {
                type: 'Point',
                coordinates: [lng, lat]
            };
        } else {
            throw new Error('Location not found');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        throw new Error('Could not geocode the location. Please check the address.');
    }
}

// Reverse geocoding utility function
async function reverseGeocode(lat, lng) {
    try {
        const response = await geocodingClient
            .reverseGeocode({
                query: [lng, lat],
                limit: 1
            })
            .send();

        if (response.body.features && response.body.features.length > 0) {
            return response.body.features[0].place_name;
        } else {
            throw new Error('Address not found');
        }
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        throw new Error('Could not reverse geocode the coordinates.');
    }
}

// Nearby places search utility function
async function searchNearbyPlaces(lat, lng, query, limit = 5) {
    try {
        const response = await geocodingClient
            .forwardGeocode({
                query: query,
                proximity: [lng, lat],
                limit: limit
            })
            .send();

        if (response.body.features) {
            return response.body.features.map(feature => ({
                name: feature.text,
                address: feature.place_name,
                coordinates: feature.center
            }));
        } else {
            return [];
        }
    } catch (error) {
        console.error('Nearby places search error:', error);
        throw new Error('Could not search nearby places.');
    }
}

// Distance calculation utility function (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
}

// Batch geocoding utility function
async function batchGeocode(locations) {
    const results = [];
    for (const location of locations) {
        try {
            const coords = await geocodeLocation(location.location, location.country);
            results.push({
                ...location,
                lat: coords.lat,
                lng: coords.lng,
                success: true
            });
        } catch (error) {
            results.push({
                ...location,
                error: error.message,
                success: false
            });
        }
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
}

// Index - Show all listings
module.exports.index = asyncWrap(async (req, res) => {
    const allListings = await Listing.find({});
    res.render("listings/index", {
        allListings,
        layout: 'boilerplate'
    });
});

// New - Show form to create new listing
module.exports.renderNewForm = (req, res) => {
    res.render("listings/new", {
        listing: {},
        errors: null,
        layout: 'boilerplate'
    });
};

// Create - Create new listing
module.exports.createListing = asyncWrap(async (req, res) => {
    try {
        const data = req.body.listing || {};

        // Handle image upload from Cloudinary
        if (req.file) {
            data.image = {
                url: req.file.path, // Cloudinary URL
                filename: req.file.filename // Cloudinary public_id
            };
        } else if (req.body.listing && req.body.listing.imageUrl) {
            // Handle URL input from form
            data.image = { url: req.body.listing.imageUrl };
        } else if (data.image && typeof data.image === 'string') {
            // Fallback for direct URL input
            data.image = { url: data.image };
        }

        // Add owner to the listing data
        data.owner = req.user._id;

        // Geocode the location
        try {
            const geometry = await geocodeLocation(data.location, data.country);
            data.geometry = geometry;
        } catch (error) {
            req.flash('error', error.message);
            return res.redirect('/listings/new');
        }

        const newListing = new Listing(data);
        await newListing.save();
        req.flash('success', 'Listing created successfully!');
        res.redirect("/listings");
    } catch (err) {
        if (err.name === 'ValidationError') {
            // Send back field-level errors and entered values for inline display
            return res.status(400).render('listings/new', {
                listing: req.body.listing || {},
                errors: err.errors,
                layout: 'boilerplate'
            });
        }
        console.error(err);
        req.flash('error', 'Failed to create listing. Please try again.');
        res.redirect("/listings/new");
    }
});

// Show - Show individual listing
module.exports.showListing = asyncWrap(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id)
        .populate({
            path: 'reviews',
            populate: { path: 'author', select: 'username' }
        })
        .populate('owner');

    if (!listing) {
        req.flash('error', 'Listing not found');
        return res.redirect('/listings');
    }

    res.render("listings/show", {
        listing,
        mapboxToken: process.env.MAPBOX_ACCESS_TOKEN,
        layout: 'boilerplate'
    });
});

// Edit - Show form to edit listing
module.exports.renderEditForm = asyncWrap(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash('error', 'Listing not found');
        return res.redirect('/listings');
    }
    res.render("listings/edit.ejs", {
        listing,
        errors: null,
        layout: 'boilerplate'
    });
});

// Update - Update existing listing
module.exports.updateListing = asyncWrap(async (req, res) => {
    try {
        let { id } = req.params;
        const data = req.body.listing || {};

        // Handle image upload from Cloudinary
        if (req.file) {
            data.image = {
                url: req.file.path, // Cloudinary URL
                filename: req.file.filename // Cloudinary public_id
            };
        } else if (req.body.listing && req.body.listing.imageUrl) {
            // Handle URL input from form
            if (req.body.listing.imageUrl.trim() !== '') {
                data.image = { url: req.body.listing.imageUrl };
            } else {
                // If empty URL, don't update image field
                delete data.image;
            }
        } else if (data.image && typeof data.image === 'string') {
            // Fallback for direct URL input or keep existing image
            if (data.image.trim() === '') {
                // If empty string, don't update image field
                delete data.image;
            } else {
                data.image = { url: data.image };
            }
        }

        // Geocode if location or country is provided
        if (data.location && data.country) {
            try {
                const geometry = await geocodeLocation(data.location, data.country);
                data.geometry = geometry;
            } catch (error) {
                req.flash('error', error.message);
                return res.redirect(`/listings/${id}/edit`);
            }
        }

        const listing = await Listing.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true
        });

        if (!listing) {
            req.flash('error', 'Listing not found');
            return res.redirect('/listings');
        }

        req.flash('success', 'Listing updated successfully!');
        res.redirect(`/listings/${id}`);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const listing = await Listing.findById(req.params.id);
            return res.status(400).render('listings/edit', {
                listing: { ...listing.toObject(), ...req.body.listing },
                errors: err.errors,
                layout: 'boilerplate'
            });
        }
        console.error(err);
        req.flash('error', 'Failed to update listing. Please try again.');
        res.redirect(`/listings/${req.params.id}/edit`);
    }
});

// Delete - Delete listing
module.exports.deleteListing = asyncWrap(async (req, res) => {
    try {
        let { id } = req.params;
        const deletedListing = await Listing.findByIdAndDelete(id);

        if (!deletedListing) {
            req.flash('error', 'Listing not found');
            return res.redirect('/listings');
        }

        req.flash('success', 'Listing deleted successfully!');
        res.redirect("/listings");
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to delete listing. Please try again.');
        res.redirect(`/listings/${req.params.id}`);
    }
});

module.exports = {
    index: module.exports.index,
    renderNewForm: module.exports.renderNewForm,
    createListing: module.exports.createListing,
    showListing: module.exports.showListing,
    renderEditForm: module.exports.renderEditForm,
    updateListing: module.exports.updateListing,
    deleteListing: module.exports.deleteListing,
    reverseGeocode,
    searchNearbyPlaces,
    calculateDistance,
    batchGeocode
};