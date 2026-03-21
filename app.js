const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./Models/listing.js");
const User = require("./Models/user.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsLayouts = require("express-ejs-layouts");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const asyncWrap = require("./public/utilities/asyncWrap");
const { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, DatabaseError } = require("./public/utilities/CustomError");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderstay";

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

// Middleware to make user available in all templates
app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId ? true : false;
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
            throw new ValidationError('Username or email already exists');
        }
        const newUser = new User({ email, username, password });
        await newUser.save();
        req.session.userId = newUser._id;
        res.redirect("/listings");
    } catch (e) {
        req.session.errorMessage = e.message || 'Signup failed';
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
            throw new AuthenticationError('Invalid username or password');
        }
        req.session.userId = user._id;
        res.redirect("/listings");
    } catch (e) {
        req.session.errorMessage = e.message || 'Login failed';
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
  const allListings = await Listing.find({});
  res.render("listings/index", { allListings, layout: 'boilerplate' });
}));

//Index Route
app.get("/listings", asyncWrap(async (req, res) => {
  const allListings = await Listing.find({});
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
  res.render("listings/new");
});

//Show Route
app.get("/listings/:id", asyncWrap(async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  res.render("listings/show", { listing });
}));

//Create Route
app.post("/listings", isLoggedIn, asyncWrap(async (req, res) => {
  try {
    // Normalize incoming image field to match schema (image.url)
    const data = req.body.listing || {};
    if (data.image && typeof data.image === 'string') {
      data.image = { url: data.image };
    }

    const newListing = new Listing(data);
    await newListing.save();
    req.session.successMessage = 'Listing created successfully!';
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
    req.session.errorMessage = 'Failed to create listing. Please try again.';
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