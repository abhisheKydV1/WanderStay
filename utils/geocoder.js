const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });

module.exports.geocodeLocation = async (location, country) => {
  try {
    const query = `${location}, ${country}`;
    const geoData = await geocoder.forwardGeocode({
      query: query,
      limit: 1
    }).send();

    if (geoData.body.features.length === 0) {
      throw new Error('Location not found');
    }

    const { center } = geoData.body.features[0];
    return {
      type: 'Point',
      coordinates: center
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    // Return default coordinates for Mumbai, India if geocoding fails
    return {
      type: 'Point',
      coordinates: [72.8777, 19.0760] // Mumbai coordinates as fallback
    };
  }
};