// --------------------
// airo.js - Full single-file app (Corrected, Mobile-ready, WhatsApp-style)
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// --------------------
// Credentials (no ENV)
// --------------------
const MONGO_URI = "mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0";
const JWT_SECRET = "supersecretkey";
const ADMIN_EMAIL = "odiad293@gmail.com";

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// MongoDB setup
// --------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(()=>console.log("MongoDB connected"))
    .catch(err=>console.log("MongoDB connection error:", err));

// --------------------
// Schemas
// --------------------
const { Schema, model } = mongoose;

const userSchema = new Schema({
    username: { type:String, unique:true },
    email: { type:String, unique:true },
    password: String,
    profile_photo: String,
    isAdmin: { type:Boolean, default:false }
}, { timestamps:true });
const User = model('User', userSchema);

const messageSchema = new Schema({
    sender_id: { type: Schema.Types.ObjectId, ref:'User' },
    receiver_id: { type: Schema.Types.ObjectId, ref:'User' },
    content: String,
    media_url: String,
    media_type: String
}, { timestamps:true });
const Message = model('Message', messageSchema);

const statusSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref:'User' },
    content: String,
    media_url: String,
    media_type: String,
    expire_at: Date
}, { timestamps:true });
const Status = model('Status', statusSchema);

// --------------------
// JWT Middleware
// --------------------
const verifyToken = (req,res,next)=>{
    const token = req.headers['authorization']?.split(' ')[1];
    if(!token) return res.status(401).send('Unauthorized');
    try{
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    }catch(e){
        console.log("JWT error:", e.message);
        return res.status(401).send('Unauthorized');
    }
};
const verifyAdmin = async (req,res,next)=>{
    const user = await User.findById(req.userId);
    if(user && user.isAdmin) next();
    else res.status(403).send('Admin only');
};

// --------------------
// Root Route (Login + Signup)
// --------------------
app.get('/', (req,res)=>{
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AiroMessenger</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-blue-100 min-h-screen flex items-center justify-center">
<div id="auth-container" class="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md">
<h1 class="text-2xl font-bold text-center mb-4 text-blue-600 dark:text-white">Airo Messenger</h1>

<div id="login-form">
<input type="text" id="login-username" placeholder="Username" class="w-full mb-3 p-2 border rounded">
<input type="password" id="login-password" placeholder="Password" class="w-full mb-3 p-2 border rounded">
<button id="login-btn" class="w-full bg-blue-600 text-white p-2 rounded mb-2">Login</button>
<p class="text-center text-sm">No account? <span id="show-signup" class="text-blue-600 cursor-pointer">Sign Up</span></p>
</div>

<div id="signup-form" class="hidden">
<input type="text" id="signup-username" placeholder="Username" class="w-full mb-3 p-2 border rounded">
<input type="email" id="signup-email" placeholder="Email" class="w-full mb-3 p-2 border rounded">
<input type="password" id="signup-password" placeholder="Password" class="w-full mb-3 p-2 border rounded">
<button id="signup-btn" class="w-full bg-green-600 text-white p-2 rounded mb-2">Sign Up</button>
<p class="text-center text-sm">Already have account? <span id="show-login" class="text-blue-600 cursor-pointer">Login</span></p>
</div>

</div>

<script>
document.getElementById('show-signup').onclick = ()=>{
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
};
document.getElementById('show-login').onclick = ()=>{
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
};

// --------------------
// Login
document.getElementById('login-btn').onclick = async ()=>{
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await fetch('/login',{ 
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if(res.status===200){
        localStorage.setItem('token', data.token);
        window.location.href='/dashboard';
    }else{
        alert(data.message||'Login failed');
    }
};

// --------------------
// Signup
document.getElementById('signup-btn').onclick = async ()=>{
    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const res = await fetch('/signup',{ 
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if(res.status===200){
        alert('Account created! Please login.');
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    }else{
        alert(data.message||'Signup failed');
    }
};
</script>
</body>
</html>
    `);
});

// --------------------
// Signup/Login Routes
// --------------------
app.post('/signup', async (req,res)=>{
    try{
        const { username,email,password } = req.body;
        if(!username||!email||!password) return res.status(400).json({ message:'Missing fields' });
        const hash = await bcrypt.hash(password, 10);
        const user = new User({ username,email,password:hash });
        if(email===ADMIN_EMAIL) user.isAdmin=true;
        await user.save();
        res.json({ message:'Account created' });
    }catch(e){
        console.log(e);
        res.status(500).json({ message:'Signup error' });
    }
});

app.post('/login', async (req,res)=>{
    try{
        const { username,password } = req.body;
        const user = await User.findOne({ username });
        if(!user) return res.status(400).json({ message:'User not found' });
        const valid = await bcrypt.compare(password,user.password);
        if(!valid) return res.status(400).json({ message:'Wrong password' });
        const token = jwt.sign({ id:user._id }, JWT_SECRET, { expiresIn:'7d' });
        res.json({ token });
    }catch(e){
        console.log(e);
        res.status(500).json({ message:'Login error' });
    }
});

// --------------------
// Dashboard
// --------------------
app.get('/dashboard', verifyToken, async (req,res)=>{
    const currentUser = await User.findById(req.userId);
    const otherUsers = await User.find({ _id: { $ne: req.userId } });

    let usersHTML='';
    otherUsers.forEach(u=>{
        usersHTML+=`<div class="p-2 border-b cursor-pointer hover:bg-blue-100 chat-user dark:hover:bg-gray-700" data-id="${u._id}">
            <img src="${u.profile_photo||'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full inline mr-2">
            <span>${u.username}</span>
        </div>`;
    });

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Airo Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="/socket.io/socket.io.js"></script>
</head>
<body class="bg-blue-50 dark:bg-gray-900 min-h-screen">
<div class="flex flex-col h-screen">
<div class="flex-1 overflow-y-auto p-4">
<h2 class="text-xl font-bold mb-4 text-blue-600 dark:text-white">Contacts</h2>
${usersHTML}
</div>
<div class="p-4 flex justify-between bg-white dark:bg-gray-800">
<input type="text" id="message-input" placeholder="Type a message" class="flex-1 p-2 border rounded mr-2">
<input type="file" id="media-input" class="mr-2">
<button id="send-btn" class="bg-blue-600 text-white px-4 py-2 rounded">Send</button>
</div>
<button id="dark-toggle" class="fixed top-2 right-2 bg-gray-300 p-2 rounded">Dark/Light</button>
</div>

<script>
const socket = io(window.location.origin);
let selectedUserId=null;

document.querySelectorAll('.chat-user').forEach(el=>{
    el.addEventListener('click',()=>{
        selectedUserId=el.dataset.id;
        alert('Selected user for chat: '+el.innerText);
    });
});

document.getElementById('send-btn').onclick = async ()=>{
    const content = document.getElementById('message-input').value;
    const mediaFile = document.getElementById('media-input').files[0];
    if(!selectedUserId) return alert('Select a contact first');
    const form = new FormData();
    form.append('content',content);
    if(mediaFile) form.append('media',mediaFile);
    const res = await fetch('/chat/'+selectedUserId, {
        method:'POST',
        headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') },
        body:form
    });
    const msg = await res.json();
    document.getElementById('message-input').value='';
    document.getElementById('media-input').value='';
};

socket.on('receiveMessage', msg=>{
    console.log('New message received', msg);
});

// Dark/Light toggle
document.getElementById('dark-toggle').onclick = ()=>{
    document.body.classList.toggle('dark');
};
</script>
</body>
</html>
    `);
});

// --------------------
// Chat API
// --------------------
app.post('/chat/:userId', verifyToken, async (req,res)=>{
    let media_url=null, media_type=null;
    if(req.files && req.files.media){
        const file = req.files.media;
        const fileName = Date.now()+'-'+file.name;
        await file.mv(path.join(uploadsDir,fileName));
        media_url='/uploads/'+fileName;
        media_type=file.mimetype;
    }
    const message = new Message({ sender_id:req.userId, receiver_id:req.params.userId, content:req.body.content, media_url, media_type });
    await message.save();
    io.emit('receiveMessage', message);
    res.json(message);
});

// --------------------
// Status API
// --------------------
app.post('/status', verifyToken, async (req,res)=>{
    let media_url=null, media_type=null;
    if(req.files && req.files.media){
        const file = req.files.media;
        const fileName = Date.now()+'-'+file.name;
        await file.mv(path.join(uploadsDir,fileName));
        media_url='/uploads/'+fileName;
        media_type=file.mimetype;
    }
    const status = new Status({ user_id:req.userId, content:req.body.content, media_url, media_type, expire_at:new Date(Date.now()+24*60*60*1000) });
    await status.save();
    res.json(status);
});

app.get('/status', verifyToken, async (req,res)=>{
    const statuses = await Status.find({ expire_at: { $gt: new Date() } }).populate('user_id','username profile_photo');
    res.json(statuses);
});

// --------------------
// Admin dashboard
// --------------------
app.get('/admin/dashboard', verifyToken, verifyAdmin, async (req,res)=>{
    const users = await User.find();
    const messages = await Message.find();
    const statuses = await Status.find();
    res.json({ users, messages, statuses });
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log("Airo Messenger running on port "+PORT));
