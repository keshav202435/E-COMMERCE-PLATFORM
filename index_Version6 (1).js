// --- IMPORTS ---
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

// --- CONFIG ---
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/shopwithsingh";
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serves logo.svg etc.

// --- DB MODELS ---
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log("MongoDB Connected"))
  .catch(err => { console.error("MongoDB Error:", err.message); process.exit(1); });

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model("User", userSchema);

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  countInStock: Number,
  image: String
});
const Product = mongoose.model("Product", productSchema);

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  quantity: { type: Number, default: 1 }
});
const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  items: [cartItemSchema]
});
const Cart = mongoose.model("Cart", cartSchema);

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
});
const Wishlist = mongoose.model("Wishlist", wishlistSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: Number
    }
  ],
  total: Number,
  status: { type: String, default: "Processing" },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", orderSchema);

// --- AUTH MIDDLEWARE ---
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// --- SEED DATA ---
async function seedIfNeeded() {
  const userCount = await User.countDocuments();
  const prodCount = await Product.countDocuments();
  if (userCount === 0 && prodCount === 0) {
    const adminPassword = await bcrypt.hash("admin123", 10);
    await User.create({
      name: "Admin User",
      email: "admin@shopwithsingh.com",
      password: adminPassword,
      isAdmin: true
    });
    await Product.insertMany([
      {
        name: "Wireless Headphones",
        description: "High-quality sound with noise cancellation",
        price: 2999,
        countInStock: 20,
        image: "/logo.svg"
      },
      {
        name: "Smartphone",
        description: "Latest model with amazing features",
        price: 19999,
        countInStock: 15,
        image: "/logo.svg"
      },
      {
        name: "Laptop",
        description: "Powerful laptop for professionals and students",
        price: 55999,
        countInStock: 10,
        image: "/logo.svg"
      }
    ]);
    console.log("✅ Database seeded with admin and sample products");
  }
}
seedIfNeeded().catch(e=>console.error("Seed error:",e));

// --- API ROUTES ---
// Auth
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (!name || !email || !password) throw new Error("All fields required");
    const exists = await User.findOne({ email });
    if (exists) throw new Error("Email already registered");
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.status(201).json({ user, token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Registration failed" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) throw new Error("All fields required");
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user._id }, JWT_SECRET);
      res.json({ user, token });
    } else {
      throw new Error("Invalid credentials");
    }
  } catch (e) {
    res.status(401).json({ error: e.message || "Login failed" });
  }
});

// Products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    res.json(product);
  } catch(e) {
    res.status(404).json({ error: "Product not found" });
  }
});
app.get("/api/products/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const products = await Product.find({ name: { $regex: q, $options: "i" } });
    res.json(products);
  } catch(e) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Cart
app.get("/api/cart", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.userId }).populate("items.productId");
    res.json(cart ? cart.items : []);
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});
app.post("/api/cart/add", auth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) throw new Error("Product and quantity required");
    let cart = await Cart.findOne({ userId: req.user.userId });
    if (!cart) cart = new Cart({ userId: req.user.userId, items: [] });
    const idx = cart.items.findIndex(i => i.productId.equals(productId));
    if (idx >= 0) {
      cart.items[idx].quantity += quantity;
    } else {
      cart.items.push({ productId, quantity });
    }
    await cart.save();
    res.json(cart.items);
  } catch(e) {
    res.status(400).json({ error: e.message || "Add to cart failed" });
  }
});
app.delete("/api/cart/remove/:productId", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.userId });
    if (!cart) return res.status(404).json([]);
    cart.items = cart.items.filter(i => !i.productId.equals(req.params.productId));
    await cart.save();
    res.json(cart.items);
  } catch(e) {
    res.status(500).json({ error: "Remove from cart failed" });
  }
});

// Wishlist
app.get("/api/wishlist", auth, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.userId }).populate("items");
    res.json(wishlist ? wishlist.items : []);
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});
app.post("/api/wishlist/add", auth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) throw new Error("Product required");
    let wishlist = await Wishlist.findOne({ userId: req.user.userId });
    if (!wishlist) wishlist = new Wishlist({ userId: req.user.userId, items: [] });
    if (!wishlist.items.find(pid => pid.equals(productId))) {
      wishlist.items.push(productId);
    }
    await wishlist.save();
    res.json(wishlist.items);
  } catch(e) {
    res.status(400).json({ error: e.message || "Add to wishlist failed" });
  }
});
app.delete("/api/wishlist/remove/:productId", auth, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.userId });
    if (!wishlist) return res.status(404).json([]);
    wishlist.items = wishlist.items.filter(pid => pid.toString() !== req.params.productId);
    await wishlist.save();
    res.json(wishlist.items);
  } catch(e) {
    res.status(500).json({ error: "Remove from wishlist failed" });
  }
});

// Orders
app.get("/api/orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId }).populate("products.productId");
    res.json(orders);
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});
app.post("/api/orders/checkout", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) return res.status(400).json({ error: "Cart empty" });
    const total = cart.items.reduce((sum, item) => sum + item.productId.price * item.quantity, 0);
    const products = cart.items.map(item => ({
      productId: item.productId._id,
      quantity: item.quantity
    }));
    const order = await Order.create({ userId: req.user.userId, products, total });
    cart.items = [];
    await cart.save();
    res.json(order);
  } catch(e) {
    res.status(400).json({ error: "Checkout failed" });
  }
});

// Admin (must be logged in as admin)
app.get("/api/admin/users", auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.isAdmin) return res.status(403).json({ error: "Forbidden" });
    const users = await User.find();
    res.json(users);
  } catch(e) {
    res.status(500).json({ error: "Admin fetch failed" });
  }
});
app.get("/api/admin/products", auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.isAdmin) return res.status(403).json({ error: "Forbidden" });
    const products = await Product.find();
    res.json(products);
  } catch(e) {
    res.status(500).json({ error: "Admin fetch failed" });
  }
});
app.get("/api/admin/orders", auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me?.isAdmin) return res.status(403).json({ error: "Forbidden" });
    const orders = await Order.find().populate("products.productId");
    res.json(orders);
  } catch(e) {
    res.status(500).json({ error: "Admin fetch failed" });
  }
});

// --- FRONTEND ROUTE ---
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Shop With Singh</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="icon" href="/logo.svg"/>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat:400,700&display=swap"/>
  <style>
    body { font-family: Montserrat, Arial, sans-serif; margin:0; background:#fff; color:#111; }
    .navbar { background:#000; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:1em 2em; }
    .navbar a { color:#fff; text-decoration:none; margin-right:2em; font-weight:500; }
    .navbar img { height:38px; margin-right:1em; }
    .card { background:#fff; border-radius:8px; box-shadow:0 2px 8px #0001; padding:1em; margin:1em 0; }
    button, input[type="submit"] { background:#000; color:#fff; border:none; border-radius:6px; padding:0.7em 1.5em; font-weight:bold; cursor:pointer; }
    input, select { font-size:1em; margin-bottom:1em; padding:0.7em; border:1px solid #222; border-radius:6px; width:100%; }
    .container { max-width:700px; margin:2em auto; }
    .flex { display:flex; flex-wrap:wrap; gap:2em; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-router-dom@6/umd/react-router-dom.development.js"></script>
  <script>
    // [React frontend code goes here, as provided before]
    // For brevity, refer to previous answers for full UI code.
  </script>
</body>
</html>
  `);
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(\`Shop With Singh running on http://localhost:\${PORT}\`);
});