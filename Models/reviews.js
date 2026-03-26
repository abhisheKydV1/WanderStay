const mongoose = require("mongoose");
const Joi = require("joi");
const Schema = mongoose.Schema;

const reviewSchema = new Schema({
  comment: {
    type: String,
    required: [true, "Comment is required"],
    trim: true,
    minlength: [5, "Comment must be at least 5 characters long"],
    maxlength: [500, "Comment cannot exceed 500 characters"],
  },
  rating: {
    type: Number,
    required: [true, "Rating is required"],
    min: [1, "Rating must be at least 1"],
    max: [5, "Rating cannot exceed 5"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  listing: {
    type: Schema.Types.ObjectId,
    ref: "Listing",
    required: true,
  },
});

const reviewJoiSchema = Joi.object({
  comment: Joi.string().min(5).max(500).required().messages({
    'string.empty': 'Comment is required',
    'string.min': 'Comment must be at least 5 characters long',
    'string.max': 'Comment cannot exceed 500 characters',
  }),
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.base': 'Rating must be a number',
    'number.min': 'Rating must be at least 1',
    'number.max': 'Rating cannot exceed 5',
  }),
});

const Review = mongoose.model("Review", reviewSchema);

// Joi validation methods
Review.validateReview = function(data) {
  return reviewJoiSchema.validate(data, { abortEarly: false });
};

Review.validateField = function(field, value) {
  const fieldSchema = Joi.object({ [field]: reviewJoiSchema.extract(field) });
  return fieldSchema.validate({ [field]: value }, { abortEarly: false });
};

module.exports = Review;