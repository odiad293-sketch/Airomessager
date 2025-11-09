// --------------------
// airo.js - WhatsApp-style Messenger Single File
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

const MONGO_URI = "mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0"; // replace if needed
const JWT_SECRET = "supersecretkey"; // secret for JWT
const ADMIN_EMAIL = "odiad293@gmail.com"; // admin email

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// MongoDB Connection
// --------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.error("MongoDB error:", err));

// --------------------
// Schemas
// --------------------
const { Schema, model } = mongoose;

const userSchema = new Schema({
    username: { type: String, unique:true },
    password: String,
    profile_photo: String,
    isAdmin: { type: Boolean, default: false },
    dark_mode: { type: Boolean, default: false }
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
const verifyToken = (req,res,next)=>{
    const token = req.headers['authorization']?.split(' ')[1];
    if(!token) return res.status(401).send('Unauthorized');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch(e){
        return res.status(401).send('Unauthorized');
    }
};

// --------------------
// Admin Middleware
// --------------------
const verifyAdmin = async (req,res,next)=>{
    const user = await User.findById(req.userId);
    if(user && user.isAdmin) next();
    else res.status(403).send('Admin only');
};

// --------------------
// Routes
// --------------------

// Root route
app.get('/', (req,res)=>{
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Messenger</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body, html { height: 100%; margin:0; padding:0; }
.login-container { display:flex; justify-content:center; align-items:center; height:100%; }
.dark-mode { background-color:#1a1a1a; color:#ccc; }
</style>
</head>
<body class="bg-white">
<div class="login-container">
<div class="w-full max-w-md p-6 bg-white rounded shadow-lg">
<h2 class="text-2xl font-bold mb-4 text-center">Airo Messenger</h2>
<div id="login-form">
<input type="text" id="login-username" placeholder="Username" class="w-full mb-2 p-2 border rounded">
<input type="password" id="login-password" placeholder="Password" class="w-full mb-2 p-2 border rounded">
<button id="login-btn" class="w-full bg-blue-500 text-white p-2 rounded mb-2">Login</button>
<p class="text-center">No account? <span id="show-signup" class="text-blue-500 cursor-pointer">Sign Up</span></p>
</div>
<div id="signup-form" class="hidden">
<input type="text" id="signup-username" placeholder="Username" class="w-full mb-2 p-2 border rounded">
<input type="password" id="signup-password" placeholder="Password" class="w-full mb-2 p-2 border rounded">
<button id="signup-btn" class="w-full bg-green-500 text-white p-2 rounded mb-2">Sign Up</button>
<p class="text-center">Already have an account? <span id="show-login" class="text-blue-500 cursor-pointer">Login</span></p>
</div>
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

// Login
document.getElementById('login-btn').onclick = async ()=>{
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await fetch('/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ username,password })
    });
    const data = await res.json();
    if(res.status===200){
        localStorage.setItem('token', data.token);
        window.location.href='/dashboard';
    } else {
        alert(data.error || 'Unauthorized');
    }
};

// Signup
document.getElementById('signup-btn').onclick = async ()=>{
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
    const res = await fetch('/signup', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ username,password })
    });
    const data = await res.json();
    if(res.status===200 || res.status===201){
        alert('Account created. Please login.');
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    } else {
        alert(data.error || 'Error');
    }
};
</script>
</body>
</html>
    `);
});

// --------------------
// Signup/Login API
// --------------------
app.post('/signup', async (req,res)=>{
    try{
        const { username, password } = req.body;
        if(!username || !password) return res.status(400).json({error:'Missing fields'});
        const hash = await bcrypt.hash(password,10);
        const user = new User({ username, password: hash });
        if(username===ADMIN_EMAIL) user.isAdmin=true;
        await user.save();
        res.status(201).json({message:'User created'});
    } catch(e){
        res.status(400).json({error:'Username taken or error'});
    }
});

app.post('/login', async (req,res)=>{
    try{
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if(!user) return res.status(401).json({error:'Unauthorized'});
        const valid = await bcrypt.compare(password, user.password);
        if(!valid) return res.status(401).json({error:'Unauthorized'});
        const token = jwt.sign({id:user._id}, JWT_SECRET, {expiresIn:'7d'});
        res.json({token});
    } catch(e){
        res.status(500).json({error:'Error'});
    }
});

// --------------------
// Dashboard (WhatsApp-style UI)
// --------------------
app.get('/dashboard', verifyToken, async (req,res)=>{
    const currentUser = await User.findById(req.userId);
    const otherUsers = await User.find({ _id:{ $ne: req.userId } });
    let usersHTML='';
    otherUsers.forEach(u=>{
        usersHTML+=`<div class="p-2 border-b cursor-pointer chat-user" data-id="${u._id}"><span>${u.username}</span></div>`;
    });

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<script src="/socket.io/socket.io.js"></script>
<style>
body,html{margin:0;padding:0;height:100%;}
.dark-mode{background:#1a1a1a;color:#ccc;}
.chat-container{display:flex;height:100vh;}
.contacts{width:25%;border-right:1px solid #ddd;overflow-y:auto;background:#f5f5f5;}
.chat-section{flex:1;display:flex;flex-direction:column;}
.chat-header{padding:10px;border-bottom:1px solid #ddd;font-weight:bold;}
.chat-messages{flex:1;padding:10px;overflow-y:auto;background:#fff;}
.chat-input{padding:10px;border-top:1px solid #ddd;display:flex;}
.chat-input input[type=text]{flex:1;padding:5px;margin-right:5px;}
.chat-input button{padding:5px 10px;background:#3b82f6;color:white;border:none;border-radius:5px;}
</style>
</head>
<body class="bg-white">
<div class="chat-container">
<div class="contacts">
<h2 class="p-2 font-bold">Contacts</h2>
${usersHTML}
<button id="toggle-theme" class="m-2 p-1 bg-gray-200 rounded">Toggle Dark Mode</button>
</div>
<div class="chat-section">
<div id="chat-header" class="chat-header">Select a contact</div>
<div id="chat-messages" class="chat-messages"></div>
<div class="chat-input">
<input type="text" id="message-input" placeholder="Type a message...">
<button id="send-btn">Send</button>
</div>
</div>
</div>
<script>
const socket = io(window.location.origin);
let selectedUserId = null;

document.querySelectorAll('.chat-user').forEach(el=>{
    el.onclick=()=>{
        selectedUserId=el.dataset.id;
        document.getElementById('chat-header').innerText=el.innerText;
        loadMessages();
    }
});

async function loadMessages(){
    if(!selectedUserId) return;
    const res = await fetch('/chat/'+selectedUserId,{headers:{'Authorization':'Bearer '+localStorage.getItem('token')}});
    const msgs = await res.json();
    const div = document.getElementById('chat-messages');
    div.innerHTML='';
    msgs.forEach(m=>{
        const msgDiv=document.createElement('div');
        msgDiv.innerText=m.content;
        msgDiv.style.textAlign = m.sender_id=== "${currentUser._id}" ? 'right':'left';
        div.appendChild(msgDiv);
    });
    div.scrollTop=div.scrollHeight;
}

document.getElementById('send-btn').onclick=async()=>{
    if(!selectedUserId) return alert('Select a contact');
    const content=document.getElementById('message-input').value;
    const res=await fetch('/chat/'+selectedUserId,{
        method:'POST',
        headers:{'Authorization':'Bearer '+localStorage.getItem('token')},
        body:JSON.stringify({content})
    });
    document.getElementById('message-input').value='';
};

socket.on('receiveMessage',msg=>{
    if(msg.sender_id===selectedUserId || msg.receiver_id===selectedUserId) loadMessages();
});

// Theme toggle
document.getElementById('toggle-theme').onclick=()=>{
    document.body.classList.toggle('dark-mode');
};
</script>
</body>
</html>
    `);
});

// --------------------
// Chat API
// --------------------
app.get('/chat/:userId', verifyToken, async (req,res)=>{
    const messages = await Message.find({
        $or:[
            { sender_id:req.userId, receiver_id:req.params.userId },
            { sender_id:req.params.userId, receiver_id:req.userId }
        ]
    }).sort({createdAt:1});
    res.json(messages);
});

app.post('/chat/:userId', verifyToken, async (req,res)=>{
    const { content } = req.body;
    const msg = new Message({ sender_id:req.userId, receiver_id:req.params.userId, content });
    await msg.save();
    io.emit('receiveMessage', msg);
    res.json(msg);
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log('Airo running on port '+PORT));
