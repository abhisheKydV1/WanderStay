const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./Models/listing.js");
const User = require("./Models/user.js");
const Review = require("./Models/reviews.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");
const multer = require("multer");
const asyncWrap = require("./public/utilities/asyncWrap");
const { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, DatabaseError } = require("./public/utilities/CustomError");

// Load environment variables
require("dotenv").config();

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderstay";

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Added for parsing JSON bodies
app.use(cookieParser("mysupersecretcode")); // Added cookie parser middleware
app.use(methodOverride("_method"));
app.use(ejsLayouts);
app.set('layout', 'boilerplate');
app.use(express.static(path.join(__dirname, "public")));

// Session configuration
const sessionOptions = {
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

app.use(session(sessionOptions));

// Initialize flash middleware (AFTER session)
app.use(flash());

// Middleware to make flash messages available in all templates
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  next();
});

// Middleware to make user available in all templates
app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId ? true : false;
    res.locals.currentUserId = req.session.userId || null;
    next();
});

// Flash message middleware (transfer session messages to locals)
app.use((req, res, next) => {
  res.locals.successMessage = req.session.successMessage || null;
  delete req.session.successMessage;
  res.locals.errorMessage = req.session.errorMessage || null;
  delete req.session.errorMessage;
  next();
});

// Middleware to check if user is authenticated
const isLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
};

// Authentication Routes

// Signup Routes
app.get("/signup", (req, res) => {
    res.render("users/signup");
});

app.post("/signup", asyncWrap(async (req, res) => {
    try {
        let { username, email, password } = req.body;
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            req.flash('error', 'Username or email already exists'); // FLASH MESSAGE
            return res.redirect("/signup");
        }
        
        // Hash password manually
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const newUser = new User({ email, username, password: hashedPassword });
        await newUser.save();
        req.session.userId = newUser._id;
        req.flash('success', `Welcome to WanderStay, ${username}!`); // FLASH MESSAGE
        res.redirect("/listings");
    } catch (e) {
        req.flash('error', e.message || 'Signup failed'); // FLASH MESSAGE
        res.redirect("/signup");
    }
}));

// Login Routes
app.get("/login", (req, res) => {
    res.render("users/login");
});

app.post("/login", asyncWrap(async (req, res) => {
    try {
        let { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            req.flash('error', 'Invalid username or password'); // FLASH MESSAGE
            return res.redirect("/login");
        }
        req.session.userId = user._id;
        req.flash('success', `Welcome back, ${user.username}!`); // FLASH MESSAGE
        res.redirect("/listings");
    } catch (e) {
        req.flash('error', e.message || 'Login failed'); // FLASH MESSAGE
        res.redirect("/login");
    }
}));

// Logout Route
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/listings");
        }
        res.redirect("/listings");
    });
});

// Help Center Route
app.get("/help", (req, res) => {
    res.render("help");
});


app.get("/", asyncWrap(async (req, res) => {
  const allListings = await Listing.find({}).sort({createdAt: -1}).limit(12);
  res.render("listings/index", { allListings, layout: 'boilerplate' });
}));

//Index Route
app.get("/listings", asyncWrap(async (req, res) => {
  const allListings = await Listing.find({}).sort({createdAt: -1}).limit(12);
  res.render("listings/index", { allListings, layout: 'boilerplate' });
}));

//Search Route
app.get("/search", asyncWrap(async (req, res) => {
  const { location, checkin, checkout, guests } = req.query;
  let query = {};
  
  if (location) {
    query.$or = [
      { location: { $regex: location, $options: 'i' } },
      { country: { $regex: location, $options: 'i' } }
    ];
  }
  
  // For now, we don't filter by dates/guests since they're not in the schema
  // But we accept the parameters for future enhancement
  
  const searchResults = await Listing.find(query);
  res.render("listings/index", { allListings: searchResults, layout: 'boilerplate' });
}));

//New Route
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new", { listing: {}, errors: {} });
});

//Show Route
app.get("/listings/:id", asyncWrap(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id).populate({
    path: 'reviews',
    populate: { path: 'author', select: 'username' }
  });
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  res.render("listings/show", { listing });
}));

// ==========================================
// COOKIE PARSER EXAMPLES FOR AIRBNB FEATURES
// ==========================================

// 1. USER PREFERENCES - Theme, Language, Currency (SIGNED COOKIES)
app.post("/api/preferences", (req, res) => {
  const { theme, language, currency } = req.body;
  
  // Using signed cookies for security - prevents tampering
  res.cookie("theme", theme || "light", { 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: false, // Allow client-side access for theme switching
    signed: true // SIGNED COOKIE - tamper-proof
  });
  
  res.cookie("language", language || "en", { 
    maxAge: 30 * 24 * 60 * 60 * 1000,
    signed: true // SIGNED COOKIE
  });
  
  res.cookie("currency", currency || "USD", { 
    maxAge: 30 * 24 * 60 * 60 * 1000,
    signed: true // SIGNED COOKIE
  });
  
  res.json({ success: true, message: "Preferences saved" });
});

// Get user preferences (VERIFYING SIGNED COOKIES)
app.get("/api/preferences", (req, res) => {
  // Use req.signedCookies to access signed cookies
  // If cookie is tampered with, it will be undefined
  const preferences = {
    theme: req.signedCookies.theme || "light", // VERIFIED SIGNED COOKIE
    language: req.signedCookies.language || "en", // VERIFIED SIGNED COOKIE
    currency: req.signedCookies.currency || "USD" // VERIFIED SIGNED COOKIE
  };
  res.json(preferences);
});

// 2. RECENTLY VIEWED LISTINGS (MIXED: SIGNED for security, UNSIGNED for client access)
app.get("/listings/:id", asyncWrap(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id).populate({
    path: 'reviews',
    populate: { path: 'author', select: 'username' }
  });
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }

  // Track recently viewed listings (SIGNED for security)
  let recentListings = req.signedCookies.recentListings ? JSON.parse(req.signedCookies.recentListings) : [];
  recentListings = recentListings.filter(listingId => listingId !== id);
  recentListings.unshift(id);
  recentListings = recentListings.slice(0, 5); // Keep last 5
  
  res.cookie("recentListings", JSON.stringify(recentListings), {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    signed: true // SIGNED - prevents users from adding fake listing IDs
  });

  res.render("listings/show", { listing });
}));

// Get recently viewed listings for recommendations
app.get("/api/recent-listings", asyncWrap(async (req, res) => {
  // Verify signed cookie - if tampered, this will be undefined
  const recentIds = req.signedCookies.recentListings ? JSON.parse(req.signedCookies.recentListings) : [];
  
  if (recentIds.length === 0) {
    return res.json({ listings: [] });
  }
  
  const listings = await Listing.find({ _id: { $in: recentIds } })
    .select('title location price image')
    .limit(5);
    
  res.json({ listings });
}));

// 3. SEARCH FILTERS & SORTING PREFERENCES (SIGNED)
app.post("/api/search-preferences", (req, res) => {
  const { sortBy, priceRange, propertyType, amenities } = req.body;
  
  res.cookie("searchPrefs", JSON.stringify({
    sortBy: sortBy || "recommended",
    priceRange: priceRange || "any",
    propertyType: propertyType || "all",
    amenities: amenities || []
  }), {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    signed: true // SIGNED - prevents users from modifying search filters
  });
  
  res.json({ success: true });
});

// Get search preferences (VERIFIED)
app.get("/api/search-preferences", (req, res) => {
  const defaultPrefs = {
    sortBy: "recommended",
    priceRange: "any", 
    propertyType: "all",
    amenities: []
  };
  
  // If signed cookie is tampered with, it becomes undefined
  const prefs = req.signedCookies.searchPrefs ? JSON.parse(req.signedCookies.searchPrefs) : defaultPrefs;
  res.json(prefs);
});

// 4. WISHLIST/FAVORITES (SIGNED for security)
app.post("/api/wishlist/add/:id", (req, res) => {
  const listingId = req.params.id;
  let wishlist = req.signedCookies.wishlist ? JSON.parse(req.signedCookies.wishlist) : []; // VERIFY SIGNED
  
  if (!wishlist.includes(listingId)) {
    wishlist.push(listingId);
  }
  
  res.cookie("wishlist", JSON.stringify(wishlist), {
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    httpOnly: true,
    signed: true // SIGNED - prevents users from adding fake listing IDs
  });
  
  res.json({ success: true, wishlist });
});

app.post("/api/wishlist/remove/:id", (req, res) => {
  const listingId = req.params.id;
  let wishlist = req.signedCookies.wishlist ? JSON.parse(req.signedCookies.wishlist) : []; // VERIFY SIGNED
  
  wishlist = wishlist.filter(id => id !== listingId);
  
  res.cookie("wishlist", JSON.stringify(wishlist), {
    maxAge: 90 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    signed: true // SIGNED
  });
  
  res.json({ success: true, wishlist });
});

app.get("/api/wishlist", asyncWrap(async (req, res) => {
  // If signed cookie is tampered with, this will be empty array
  const wishlistIds = req.signedCookies.wishlist ? JSON.parse(req.signedCookies.wishlist) : [];
  
  if (wishlistIds.length === 0) {
    return res.json({ listings: [] });
  }
  
  const listings = await Listing.find({ _id: { $in: wishlistIds } })
    .select('title location price image');
    
  res.json({ listings });
}));

// 5. LOCATION-BASED SUGGESTIONS
app.post("/api/location-preference", (req, res) => {
  const { city, country, latitude, longitude } = req.body;
  
  res.cookie("userLocation", JSON.stringify({
    city,
    country,
    coordinates: [longitude, latitude],
    timestamp: Date.now()
  }), {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true
  });
  
  res.json({ success: true });
});

// 6. ANALYTICS & TRACKING (simple page views)
app.use((req, res, next) => {
  // Track page views (simple analytics)
  if (req.path.startsWith('/listings/') && req.method === 'GET') {
    let pageViews = req.cookies.pageViews ? parseInt(req.cookies.pageViews) : 0;
    pageViews++;
    
    res.cookie("pageViews", pageViews.toString(), {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true
    });
  }
  next();
});

// Get analytics data
app.get("/api/analytics", (req, res) => {
  const analytics = {
    pageViews: req.cookies.pageViews ? parseInt(req.cookies.pageViews) : 0,
    theme: req.cookies.theme || "light",
    language: req.cookies.language || "en",
    lastVisit: req.cookies.lastVisit || null
  };
  
  // Update last visit
  res.cookie("lastVisit", new Date().toISOString(), {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true
  });
  
  res.json(analytics);
});

// 7. CLEAR ALL COOKIES (Privacy/GDPR compliance)
app.post("/api/clear-cookies", (req, res) => {
  const cookiesToClear = [
    "theme", "language", "currency", "recentListings", 
    "searchPrefs", "wishlist", "userLocation", "pageViews", "lastVisit"
  ];
  
  cookiesToClear.forEach(cookieName => {
    res.clearCookie(cookieName);
  });
  
  res.json({ success: true, message: "All cookies cleared" });
});

// ==========================================
// SIGNED COOKIE DEMONSTRATION ROUTES
// ==========================================

// DEMO: Show difference between signed and unsigned cookies
app.get("/api/cookie-demo", (req, res) => {
  res.json({
    regularCookies: req.cookies, // Can be tampered with
    signedCookies: req.signedCookies, // Tamper-proof
    explanation: "Signed cookies are cryptographically signed. If modified, they become undefined."
  });
});

// DEMO: Test signed cookie tampering (for educational purposes)
app.post("/api/test-tampering", (req, res) => {
  // Set a signed cookie
  res.cookie("testSecure", "original_value", { 
    signed: true, 
    maxAge: 60000 // 1 minute
  });
  
  res.json({ 
    message: "Signed cookie set. Try modifying it in browser dev tools and refresh /api/cookie-demo",
    note: "If you change the cookie value, req.signedCookies.testSecure will become undefined"
  });
});

// DEMO: Verify user authentication status (using signed cookies)
app.get("/api/auth-status", (req, res) => {
  // In a real app, you'd verify against database
  // Here we just show signed cookie verification
  const isAuthenticated = req.signedCookies.userToken ? true : false;
  
  res.json({
    authenticated: isAuthenticated,
    userToken: req.signedCookies.userToken || null,
    note: "This demonstrates how signed cookies can be used for secure authentication tokens"
  });
});

//Create Route
app.post("/listings", isLoggedIn, upload.single('image'), asyncWrap(async (req, res) => {
  try {
    const data = req.body.listing || {};

    // Handle image upload or URL
    if (req.file) {
      // File was uploaded
      data.image = {
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename
      };
    } else if (data.image && typeof data.image === 'string') {
      // URL was provided
      data.image = { url: data.image };
    } else {
      // No image provided
      data.image = { url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=60' };
    }

    const newListing = new Listing(data);
    await newListing.save();
    req.flash('success', 'Listing created successfully!'); // FLASH MESSAGE
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
    req.flash('error', 'Failed to create listing. Please try again.'); // FLASH MESSAGE
    res.redirect("/listings/new");
  }
}));

//Edit Route
app.get("/listings/:id/edit", isLoggedIn, asyncWrap(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  res.render("listings/edit.ejs", { listing });
}));

//Update Route
app.put("/listings/:id", isLoggedIn, asyncWrap(async (req, res) => {
  let { id } = req.params;
  await Listing.findByIdAndUpdate(id, { ...req.body.listing });
  res.redirect(`/listings/${id}`);
}));

//Delete Route
app.delete("/listings/:id", isLoggedIn, asyncWrap(async (req, res) => {
  let { id } = req.params;
  try {
    const deletedListing = await Listing.findByIdAndDelete(id);
    if (!deletedListing) {
      req.session.errorMessage = 'Listing not found.';
      return res.redirect("/listings");
    }
    req.session.successMessage = 'Listing deleted successfully!';
    res.redirect("/listings");
  } catch (err) {
    req.session.errorMessage = 'Failed to delete listing. Please try again.';
    res.redirect("/listings");
  }
}));

// Review Routes
// Create Review Route
app.post("/listings/:id/reviews", isLoggedIn, asyncWrap(async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    const { comment, rating } = req.body.review;
    
    // Validate review data
    const { error } = Review.validateReview({ comment, rating });
    if (error) {
      req.session.errorMessage = error.details[0].message;
      return res.redirect(`/listings/${id}`);
    }

    const newReview = new Review({
      comment,
      rating: parseInt(rating),
      author: req.session.userId,
      listing: id
    });

    await newReview.save();
    
    // Add review to listing's reviews array
    await Listing.findByIdAndUpdate(id, { $push: { reviews: newReview._id } });
    
    req.session.successMessage = 'Review added successfully!';
    res.redirect(`/listings/${id}`);
  } catch (err) {
    req.session.errorMessage = err.message || 'Failed to add review';
    res.redirect(`/listings/${req.params.id}`);
  }
}));

// Delete Review Route
app.delete("/listings/:id/reviews/:reviewId", isLoggedIn, asyncWrap(async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    
    // Find the review to check ownership
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }
    
    // Check if the current user is the author of the review
    if (review.author.toString() !== req.session.userId) {
      throw new AuthorizationError('You can only delete your own reviews');
    }
    
    // Remove review from database
    await Review.findByIdAndDelete(reviewId);
    
    // Remove review from listing's reviews array
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    
    req.session.successMessage = 'Review deleted successfully!';
    res.redirect(`/listings/${id}`);
  } catch (err) {
    req.session.errorMessage = err.message || 'Failed to delete review';
    res.redirect(`/listings/${req.params.id}`);
  }
}));

// ==========================================
// FLASH MESSAGE DEMO ROUTES
// ==========================================

// Demo page to test flash messages
app.get("/flash-demo", (req, res) => {
  res.render("flash-demo", { 
    title: "Flash Messages Demo",
    layout: 'boilerplate'
  });
});

// Route to trigger success flash message
app.post("/flash-success", (req, res) => {
  req.flash('success', 'This is a success message! 🎉');
  res.redirect('/flash-demo');
});

// Route to trigger error flash message
app.post("/flash-error", (req, res) => {
  req.flash('error', 'This is an error message! ❌');
  res.redirect('/flash-demo');
});

// Route to trigger multiple flash messages
app.post("/flash-multiple", (req, res) => {
  req.flash('success', 'First success message!');
  req.flash('success', 'Second success message!');
  req.flash('error', 'First error message!');
  req.flash('error', 'Second error message!');
  res.redirect('/flash-demo');
});

// app.get("/testListing", async (req, res) => {
//   let sampleListing = new Listing({
//     title: "My New Villa",
//     description: "By the beach",
//     price: 1200,
//     location: "Calangute, Goa",
//     country: "India",
//   });

//   await sampleListing.save();
//   console.log("sample was saved");
//   res.send("successful testing");
// });



// Error handling middleware
app.use((err, req, res, next) => {
  let { statusCode = 500, message = 'Something went wrong!' } = err;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.name === 'AuthenticationError') {
    statusCode = 401;
    message = err.message;
  } else if (err.name === 'AuthorizationError') {
    statusCode = 403;
    message = err.message;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = err.message;
  } else if (err.name === 'DatabaseError') {
    statusCode = 500;
    message = 'Database operation failed';
  }

  // In development, show stack trace
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
    return res.status(statusCode).json({
      success: false,
      error: message,
      stack: err.stack
    });
  }

  // In production, don't leak error details
  res.status(statusCode).json({
    success: false,
    error: message
  });
});

app.listen(8080, () => {
  console.log("server is listening to port 8080");
});