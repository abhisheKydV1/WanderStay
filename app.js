require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const flash = require("connect-flash");
const multer = require("multer");

const Listing = require("./Models/listing");
const User = require("./Models/user");
const asyncWrap = require("./public/utilities/asyncWrap");

// ✅ CLOUDINARY
// const { storage } = require("./cloudConfig");
// const upload = multer({ 
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//   }
// });

// Temporary local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// ================= DATABASE =================
const MONGO_URL = process.env.atlas_db_url;

mongoose.connect(MONGO_URL)
  .then(() => console.log("Connected to DB"))
  .catch(err => console.log(err));

// ================= APP CONFIG =================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(ejsLayouts);
app.set("layout", "boilerplate");
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploads

// ================= SESSION =================
app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: true,
}));

app.use(flash());

// ✅ GLOBAL VARIABLES (FIX ALL EJS ERRORS)
app.use((req, res, next) => {
  // Flash messages (match ALL views)
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");

  // For your new.ejs (if using successMessage)
  res.locals.successMessage = res.locals.success;
  res.locals.errorMessage = res.locals.error;

  // Auth
  res.locals.currentUser = req.session.userId;

  next();
});
// session  touch after
// ================= AUTH MIDDLEWARE =================
const isLoggedIn = (req, res, next) => {
  if (!req.session.userId) {
    req.flash("error", "You must be logged in");
    return res.redirect("/login");
  }
  next();
};

// ================= AUTH ROUTES =================
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

app.post("/signup", asyncWrap(async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await User.findOne({
    $or: [{ username }, { email }]
  });

  if (existingUser) {
    req.flash("error", "User already exists");
    return res.redirect("/signup");
  }

  const newUser = new User({ username, email, password });
  await newUser.save();

  req.session.userId = newUser._id;
  req.flash("success", "Welcome!");
  res.redirect("/listings");
}));

app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post("/login", asyncWrap(async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });

  if (!user || !(await user.comparePassword(password))) {
    req.flash("error", "Invalid credentials");
    return res.redirect("/login");
  }

  req.session.userId = user._id;
  req.flash("success", "Welcome back!");
  res.redirect("/listings");
}));

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/listings");
  });
});

// ================= LISTINGS =================
app.get("/", asyncWrap(async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index", { allListings });
}));

app.get("/listings", asyncWrap(async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index", { allListings });
}));

// ✅ NEW FORM
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new", {
    errors: null,
    listing: {}
  });
});

// SHOW
app.get("/listings/:id", asyncWrap(async (req, res) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    req.flash("error", "Listing not found");
    return res.redirect("/listings");
  }

  res.render("listings/show", { listing });
}));

// ✅ CREATE (CLOUDINARY)
app.post("/listings", isLoggedIn, upload.single("image"), asyncWrap(async (req, res) => {
  try {
    console.log('req.body:', req.body); // Debug
    console.log('req.file:', req.file); // Debug

    const data = req.body.listing || {};

    if (req.file) {
      data.image = {
        url: req.file.path,
        filename: req.file.filename
      };
    } else {
      // Set default image if no file uploaded
      data.image = {
        url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=60",
        filename: "default.jpg"
      };
    }

    data.owner = req.session.userId;

    // Add default geometry (in real app, use geocoding API)
    // data.geometry = {
    //   type: 'Point',
    //   coordinates: [0, 0] // Default coordinates, replace with actual geocoding
    // };

    console.log('Creating listing with data:', data); // Debug log

    const newListing = new Listing(data);
    // newListing.owner = mongoose.Types.ObjectId(req.session.userId); // Remove this, let Mongoose handle it
    await newListing.save();

    req.flash("success", "Listing created!");
    res.redirect("/listings");
  } catch (error) {
    console.error('Error creating listing:', error);
    req.flash("error", "Failed to create listing: " + error.message);
    res.redirect("/listings/new");
  }
}));

// DELETE
app.delete("/listings/:id", isLoggedIn, asyncWrap(async (req, res) => {
  await Listing.findByIdAndDelete(req.params.id);
  req.flash("success", "Listing deleted");
  res.redirect("/listings");
}));

// ================= API ROUTES =================

// Theme preferences
app.post("/api/preferences", (req, res) => {
  const { theme } = req.body;
  // In a real app, save to database or session
  res.json({ success: true, theme });
});

// Recent listings
app.get("/api/recent-listings", asyncWrap(async (req, res) => {
  const recentListings = await Listing.find({}).limit(5).sort({ createdAt: -1 });
  res.json({ listings: recentListings });
}));

// Wishlist add
app.post("/api/wishlist/add/:id", isLoggedIn, asyncWrap(async (req, res) => {
  // In a real app, you'd have a wishlist model
  res.json({ success: true, message: "Added to wishlist" });
}));

// Wishlist remove
app.post("/api/wishlist/remove/:id", isLoggedIn, asyncWrap(async (req, res) => {
  res.json({ success: true, message: "Removed from wishlist" });
}));

// Search preferences
app.post("/api/search-preferences", (req, res) => {
  const { sortBy, priceRange } = req.body;
  res.json({ success: true });
});

// Location preference
app.post("/api/location-preference", (req, res) => {
  const { latitude, longitude } = req.body;
  res.json({ success: true });
});

// Analytics
app.get("/api/analytics", (req, res) => {
  // Mock analytics data
  res.json({ pageViews: Math.floor(Math.random() * 1000) });
});

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.log(err);
  res.status(500).send("Something went wrong!");
});

// ================= SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});