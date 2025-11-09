// --------------------
// airo.js - Full single-file app with sessions
// --------------------
const express = require('express');
const fileUpload = require('express-fileupload');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// --------------------
// MongoDB setup (credentials in code)
// --------------------
const MONGO_URI = 'mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(session({
    secret: 'airoSecretKey123', // session secret
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// Schemas
// --------------------
const { Schema, model } = mongoose;

const userSchema = new Schema({
    username: { type: String, unique: true },
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
// Auth & Session Middleware
// --------------------
const requireLogin = (req, res, next) => {
    if (req.session.userId) next();
    else res.send('<h1 style="text-align:center;margin-top:50px;">Unauthorized. Please login first.</h1>');
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.userId) return res.send('Unauthorized');
    const user = await User.findById(req.session.userId);
    if (user && user.isAdmin) next();
    else res.send('Admin only');
};

// --------------------
// Routes
// --------------------

// Root redirect to login
app.get('/', (req, res) => res.redirect('/login'));

// --------------------
// Signup & Login
// --------------------
app.get('/signup', (req, res) => {
    res.send(`
    <html><head><title>Sign Up</title>
    <style>body{margin:0;font-family:sans-serif;background:#f0f4f7;display:flex;justify-content:center;align-items:center;height:100vh;}
    form{background:white;padding:20px;border-radius:10px;width:90%;max-width:400px;box-shadow:0 2px 10px rgba(0,0,0,0.2);}
    input{width:100%;padding:10px;margin:5px 0;border-radius:5px;border:1px solid #ccc;}
    button{width:100%;padding:10px;background:#1976d2;color:white;border:none;border-radius:5px;margin-top:10px;}
    </style></head><body>
    <form action="/signup" method="post" enctype="multipart/form-data">
    <h2 style="text-align:center;">Sign Up</h2>
    <input name="username" placeholder="Username" required>
    <input name="email" placeholder="Email" type="email" required>
    <input name="password" placeholder="Password" type="password" required>
    <input type="file" name="profile_photo">
    <button type="submit">Sign Up</button>
    <p style="text-align:center;margin-top:10px;">Already have an account? <a href="/login">Login</a></p>
    </form>
    </body></html>
    `);
});

app.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.send('Missing fields');
        const hash = await bcrypt.hash(password, 10);
        let profile_photo = null;
        if (req.files && req.files.profile_photo) {
            const file = req.files.profile_photo;
            const fileName = Date.now() + '-' + file.name;
            await file.mv(path.join(uploadsDir, fileName));
            profile_photo = '/uploads/' + fileName;
        }
        const user = new User({ username, email, password: hash, profile_photo });
        await user.save();
        res.redirect('/login');
    } catch (e) {
        console.log(e);
        res.send('Signup error. Username or Email may already exist.');
    }
});

app.get('/login', (req, res) => {
    res.send(`
    <html><head><title>Login</title>
    <style>body{margin:0;font-family:sans-serif;background:#f0f4f7;display:flex;justify-content:center;align-items:center;height:100vh;}
    form{background:white;padding:20px;border-radius:10px;width:90%;max-width:400px;box-shadow:0 2px 10px rgba(0,0,0,0.2);}
    input{width:100%;padding:10px;margin:5px 0;border-radius:5px;border:1px solid #ccc;}
    button{width:100%;padding:10px;background:#1976d2;color:white;border:none;border-radius:5px;margin-top:10px;}
    </style></head><body>
    <form action="/login" method="post">
    <h2 style="text-align:center;">Login</h2>
    <input name="username" placeholder="Username" required>
    <input name="password" placeholder="Password" type="password" required>
    <button type="submit">Login</button>
    <p style="text-align:center;margin-top:10px;">No account? <a href="/signup">Sign Up</a></p>
    </form>
    </body></html>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.send('Invalid username or password');
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.send('Invalid username or password');
        req.session.userId = user._id;
        res.redirect('/dashboard');
    } catch (e) {
        console.log(e);
        res.send('Login error');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --------------------
// Dashboard (chat + status)
// --------------------
app.get('/dashboard', requireLogin, async (req, res) => {
    const currentUser = await User.findById(req.session.userId);
    const otherUsers = await User.find({ _id: { $ne: req.session.userId } });

    let usersHTML = '';
    otherUsers.forEach(u => {
        usersHTML += `<div class="chat-user" data-id="${u._id}" style="margin:5px;padding:5px;border-bottom:1px solid #ccc;cursor:pointer;">
        <img src="${u.profile_photo||'https://via.placeholder.com/40'}" width="40" height="40" style="border-radius:50%;vertical-align:middle;">
        <span>${u.username}</span>
        </div>`;
    });

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Airo Dashboard</title>
<script src="/socket.io/socket.io.js"></script>
<style>
body,html{margin:0;padding:0;height:100%;font-family:sans-serif;}
.flex{display:flex;height:100%;}
.contacts{width:25%;background:#fff;border-right:1px solid #ccc;overflow-y:auto;padding:10px;}
.chat{flex:1;display:flex;flex-direction:column;}
.chat-header{padding:10px;background:#1976d2;color:white;font-weight:bold;}
.chat-messages{flex:1;padding:10px;overflow-y:auto;background:#e3f2fd;}
.chat-input{display:flex;padding:10px;background:#fff;border-top:1px solid #ccc;}
input[type=text]{flex:1;padding:10px;margin-right:5px;border-radius:5px;border:1px solid #ccc;}
input[type=file]{margin-right:5px;}
button{padding:10px;background:#1976d2;color:white;border:none;border-radius:5px;}
</style>
</head>
<body>
<div class="flex">
  <div class="contacts">
    <h3>Contacts</h3>
    ${usersHTML}
    <button onclick="toggleDarkMode()">Toggle Dark Mode</button>
    <a href="/logout"><button>Logout</button></a>
  </div>
  <div class="chat">
    <div class="chat-header">Select a contact</div>
    <div class="chat-messages"></div>
    <div class="chat-input">
      <input id="msg-input" type="text" placeholder="Type message...">
      <input type="file" id="media-input">
      <button onclick="sendMsg()">Send</button>
    </div>
  </div>
</div>
<script>
const socket = io();
let selectedUserId = null;

document.querySelectorAll('.chat-user').forEach(el=>{
    el.onclick = ()=>{
        selectedUserId = el.dataset.id;
        document.querySelector('.chat-header').innerText = el.innerText;
        loadMessages();
    }
});

async function loadMessages(){
    if(!selectedUserId) return;
    const res = await fetch('/chat/'+selectedUserId);
    const msgs = await res.json();
    const chatDiv = document.querySelector('.chat-messages');
    chatDiv.innerHTML='';
    msgs.forEach(m=>{
        const div = document.createElement('div');
        div.textContent = m.content;
        div.style.textAlign = m.sender_id === '${currentUser._id}' ? 'right' : 'left';
        chatDiv.appendChild(div);
    });
}

async function sendMsg(){
    if(!selectedUserId) return;
    const content = document.getElementById('msg-input').value;
    const media = document.getElementById('media-input').files[0];
    const form = new FormData();
    form.append('content', content);
    if(media) form.append('media', media);
    await fetch('/chat/'+selectedUserId, { method:'POST', body: form });
    document.getElementById('msg-input').value='';
    document.getElementById('media-input').value='';
    loadMessages();
}

socket.on('receiveMessage', ()=>{ loadMessages(); });

function toggleDarkMode(){
    document.body.classList.toggle('dark');
    if(document.body.classList.contains('dark')){
        document.body.style.background='#222';
        document.body.style.color='white';
    }else{
        document.body.style.background='';
        document.body.style.color='';
    }
}
</script>
</body>
</html>
    `);
});

// --------------------
// Chat API
// --------------------
app.get('/chat/:userId', requireLogin, async (req,res)=>{
    const messages = await Message.find({
        $or:[
            { sender_id:req.session.userId, receiver_id:req.params.userId },
            { sender_id:req.params.userId, receiver_id:req.session.userId }
        ]
    }).sort({ createdAt:1 });
    res.json(messages);
});

app.post('/chat/:userId', requireLogin, async (req,res)=>{
    let media_url=null, media_type=null;
    if(req.files && req.files.media){
        const file = req.files.media;
        const fileName = Date.now()+'-'+file.name;
        await file.mv(path.join(uploadsDir, fileName));
        media_url='/uploads/'+fileName;
        media_type=file.mimetype;
    }
    const message = new Message({ sender_id:req.session.userId, receiver_id:req.params.userId, content:req.body.content, media_url, media_type });
    await message.save();
    io.emit('receiveMessage', message);
    res.json(message);
});

// --------------------
// Status API
// --------------------
app.post('/status', requireLogin, async (req,res)=>{
    let media_url=null, media_type=null;
    if(req.files && req.files.media){
        const file = req.files.media;
        const fileName = Date.now()+'-'+file.name;
        await file.mv(path.join(uploadsDir, fileName));
        media_url='/uploads/'+fileName;
        media_type=file.mimetype;
    }
    const status = new Status({ user_id:req.session.userId, content:req.body.content, media_url, media_type, expire_at:new Date(Date.now()+24*60*60*1000) });
    await status.save();
    res.json(status);
});

app.get('/status', requireLogin, async (req,res)=>{
    const statuses = await Status.find({ expire_at: {$gt: new Date()} }).populate('user_id','username profile_photo');
    res.json(statuses);
});

// --------------------
// Admin dashboard
// --------------------
app.get('/admin/dashboard', requireLogin, requireAdmin, async (req,res)=>{
    const users = await User.find();
    const messages = await Message.find();
    const statuses = await Status.find();

    let usersHTML='', messagesHTML='', statusesHTML='';
    users.forEach(u=>usersHTML+=`<tr><td>${u._id}</td><td>${u.username}</td><td>${u.email}</td></tr>`);
    messages.forEach(m=>messagesHTML+=`<tr><td>${m._id}</td><td>${m.sender_id}</td><td>${m.receiver_id}</td><td>${m.content||''}</td></tr>`);
    statuses.forEach(s=>statusesHTML+=`<tr><td>${s._id}</td><td>${s.user_id}</td><td>${s.content||''}</td></tr>`);

    res.send(`
    <html><head><title>Admin</title></head>
    <body>
    <h1>Users</h1><table border="1">${usersHTML}</table>
    <h1>Messages</h1><table border="1">${messagesHTML}</table>
    <h1>Statuses</h1><table border="1">${statusesHTML}</table>
    </body></html>
    `);
});

// --------------------
// Socket.IO
// --------------------
io.on('connection', socket => {
    console.log('User connected');
    socket.on('disconnect', ()=>console.log('User disconnected'));
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('Airo Messenger running on port '+PORT));
