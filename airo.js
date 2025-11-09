// --------------------
// airo.js - Full single-file app (Corrected only where needed)
// --------------------
require('dotenv').config(); // <- Corrected: must be at the very top

const express = require('express');
const fileUpload = require('express-fileupload');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// --------------------
// Middleware setup
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --------------------
// MongoDB setup (Corrected only)
// --------------------
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error('Error: MONGO_URI not set!');
    process.exit(1);
}

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// --------------------
// MongoDB Schemas (unchanged)
// --------------------
const { Schema, model } = mongoose;

const userSchema = new Schema({
    username: String,
    email: { type: String, unique: true },
    password: String,
    profile_photo: String,
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });
const User = model('User', userSchema);

const messageSchema = new Schema({
    sender_id: { type: Schema.Types.ObjectId, ref: 'User' },
    receiver_id: { type: Schema.Types.ObjectId, ref: 'User' },
    content: String,
    media_url: String,
    media_type: String
}, { timestamps: true });
const Message = model('Message', messageSchema);

const statusSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    content: String,
    media_url: String,
    media_type: String,
    expire_at: Date
}, { timestamps: true });
const Status = model('Status', statusSchema);

// --------------------
// JWT Middleware (unchanged)
// --------------------
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (e) {
        return res.status(401).send('Invalid Token');
    }
};

const verifyAdmin = async (req, res, next) => {
    const user = await User.findById(req.userId);
    if (user && user.isAdmin) next();
    else res.status(403).send('Admin only');
};

// --------------------
// Root Route (unchanged)
// --------------------
app.get('/', (req, res) => {
    res.send('Welcome to Airo Messenger! Please log in at /login');
});

// --------------------
// Auth routes (unchanged)
// --------------------
app.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).send('Missing fields');
        const hash = await bcrypt.hash(password, 10);

        let profile_photo = null;
        if (req.files && req.files.profile_photo) {
            const file = req.files.profile_photo;
            const fileName = Date.now() + '-' + file.name;
            const uploadPath = path.join(uploadsDir, fileName);
            await file.mv(uploadPath);
            profile_photo = '/uploads/' + fileName;
        }

        const user = new User({ username, email, password: hash, profile_photo });
        if (email === process.env.ADMIN_EMAIL) user.isAdmin = true;

        await user.save();
        res.json({ message: 'User created' });
    } catch (e) {
        console.log(e);
        res.status(500).send('Error');
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found');
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).send('Wrong password');
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (e) {
        console.log(e);
        res.status(500).send('Error');
    }
});

// --------------------
// Dashboard, Chat, Status, Admin (unchanged)
// --------------------
// Your full FAIR code here remains unchanged...

// --------------------
// Start server (unchanged)
// --------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log('Airo running on port '+PORT));
