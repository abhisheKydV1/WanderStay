const mongoose = require("mongoose");
const Joi = require("joi");
const Schema = mongoose.Schema;

const listingSchema = new Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    minlength: [3, "Title must be at least 3 characters long"],
    maxlength: [100, "Title cannot exceed 100 characters"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    minlength: [10, "Description must be at least 10 characters long"],
    maxlength: [1000, "Description cannot exceed 1000 characters"],
  },
  image: {
    filename: {
      type: String,
      default: "default.jpg",
    },
    url: {
      type: String,
      required: [true, "Image URL is required"],
    },
  },
  price: {
    type: Number,
    required: [true, "Price is required"],
    min: [0, "Price must be a positive number"],
  },
  location: {
    type: String,
    required: [true, "Location is required"],
    trim: true,
  },
  country: {
    type: String,
    required: [true, "Country is required"],
    trim: true,
  },
  reviews: [{
    type: Schema.Types.ObjectId,
    ref: "Review",
  }],
  geometry: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
}, {
  timestamps: true,
});

const listingJoiSchema = Joi.object({
  title: Joi.string().min(3).max(100).required().messages({
    'string.empty': 'Title is required',
    'string.min': 'Title must be at least 3 characters long',
    'string.max': 'Title cannot exceed 100 characters',
  }),
  description: Joi.string().min(10).max(1000).required().messages({
    'string.empty': 'Description is required',
    'string.min': 'Description must be at least 10 characters long',
    'string.max': 'Description cannot exceed 1000 characters',
  }),
  image: Joi.object({
    filename: Joi.string().default('default.jpg'),
    url: Joi.string().required().messages({
      'string.empty': 'Image URL is required',
    }),
  }),
  price: Joi.number().min(0).required().messages({
    'number.base': 'Price must be a number',
    'number.min': 'Price must be a positive number',
  }),
  location: Joi.string().required().messages({
    'string.empty': 'Location is required',
  }),
  country: Joi.string().required().messages({
    'string.empty': 'Country is required',
  }),
  geometry: Joi.object({
    type: Joi.string().valid('Point').required(),
    coordinates: Joi.array().items(Joi.number()).length(2).required()
  }).required(),
});

const Listing = mongoose.model("Listing", listingSchema);

// Joi validation method
Listing.validateListing = function(data) {
  return listingJoiSchema.validate(data, { abortEarly: false });
};

// Validate individual field
Listing.validateField = function(field, value) {
  const fieldSchema = Joi.object({ [field]: listingJoiSchema.extract(field) });
  return fieldSchema.validate({ [field]: value }, { abortEarly: false });
};

module.exports = Listing;