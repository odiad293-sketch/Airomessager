// --------------------
// airo.js - Full single-file app
// --------------------
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

const JWT_SECRET = "mySuperSecretKey123"; // Hardcoded JWT secret
const MONGO_URI = "mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0"; // Hardcoded MongoDB

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// MongoDB
// --------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

const { Schema, model } = mongoose;

// --------------------
// Schemas
// --------------------
const userSchema = new Schema({
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    password: String,
    profile_photo: String,
    isAdmin: { type: Boolean, default: false },
    darkMode: { type: Boolean, default: false }
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
// JWT Middleware
// --------------------
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch {
        return res.status(401).send('Unauthorized');
    }
};

const verifyAdmin = async (req, res, next) => {
    const user = await User.findById(req.userId);
    if (user && user.isAdmin) next();
    else res.status(403).send('Admin only');
};

// --------------------
// Routes
// --------------------

// Root
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Messenger Login</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="h-screen bg-blue-500 flex items-center justify-center">
<div id="auth-container" class="bg-white rounded-lg shadow-lg w-11/12 max-w-md p-6">
    <h1 class="text-2xl font-bold mb-4 text-center">Airo Messenger</h1>
    <div id="login-form">
        <input type="text" id="username" placeholder="Username" class="w-full p-2 border mb-2 rounded">
        <input type="password" id="password" placeholder="Password" class="w-full p-2 border mb-2 rounded">
        <button id="login-btn" class="w-full bg-blue-500 text-white p-2 rounded">Login</button>
        <p class="mt-2 text-center">Don't have an account? <span id="show-signup" class="text-blue-500 cursor-pointer">Sign Up</span></p>
    </div>
    <div id="signup-form" class="hidden">
        <input type="text" id="signup-username" placeholder="Username" class="w-full p-2 border mb-2 rounded">
        <input type="email" id="signup-email" placeholder="Email" class="w-full p-2 border mb-2 rounded">
        <input type="password" id="signup-password" placeholder="Password" class="w-full p-2 border mb-2 rounded">
        <button id="signup-btn" class="w-full bg-green-500 text-white p-2 rounded">Sign Up</button>
        <p class="mt-2 text-center">Already have an account? <span id="show-login" class="text-blue-500 cursor-pointer">Login</span></p>
    </div>
</div>
<script>
document.getElementById('show-signup').onclick = () => {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
};
document.getElementById('show-login').onclick = () => {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
};

document.getElementById('signup-btn').onclick = async () => {
    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const res = await fetch('/signup', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username,email,password})
    });
    const data = await res.json();
    if(res.ok){ alert('Signup successful'); document.getElementById('show-login').click(); }
    else alert(data.message||'Signup error');
};

document.getElementById('login-btn').onclick = async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username,password})
    });
    const data = await res.json();
    if(res.ok){ localStorage.setItem('token',data.token); window.location='/dashboard'; }
    else alert(data.message||'Unauthorized');
};
</script>
</body>
</html>
    `);
});

// --------------------
// Signup/Login
// --------------------
app.post('/signup', async (req,res)=>{
    try {
        const { username,email,password } = req.body;
        if(!username||!email||!password) return res.status(400).json({message:'Missing fields'});
        const hashed = await bcrypt.hash(password,10);
        const user = new User({username,email,password:hashed});
        await user.save();
        res.json({message:'Signup successful'});
    } catch(err){
        console.log(err);
        res.status(400).json({message:'Signup error or user exists'});
    }
});

app.post('/login', async (req,res)=>{
    try {
        const { username,password } = req.body;
        const user = await User.findOne({ username });
        if(!user) return res.status(401).json({message:'Unauthorized'});
        const valid = await bcrypt.compare(password,user.password);
        if(!valid) return res.status(401).json({message:'Unauthorized'});
        const token = jwt.sign({id:user._id},JWT_SECRET,{expiresIn:'7d'});
        res.json({token});
    } catch(err){ console.log(err); res.status(500).json({message:'Login error'}); }
});

// --------------------
// Dashboard (placeholder)
// --------------------
app.get('/dashboard', verifyToken, async (req,res)=>{
    const user = await User.findById(req.userId);
    res.send(`<h1>Welcome ${user.username}</h1><p>Chat and other features coming soon!</p>`);
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT,()=>console.log('Airo Messenger running on port '+PORT));
