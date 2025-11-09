// --------------------
// airo.js - Full single-file app with dashboard, chat, status
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

// --------------------
// Config
// --------------------
const MONGO_URI = 'mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0';
const JWT_SECRET = 'mysecret123';
const ADMIN_EMAIL = 'odiad293@gmail.com';

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// MongoDB Setup
// --------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

// --------------------
// Schemas
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
// JWT Middleware
// --------------------
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
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
// Routes
// --------------------

// Redirect root to login
app.get('/', (req, res) => res.redirect('/login'));

// --------------------
// Login Page
// --------------------
app.get('/login', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Login</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center h-screen">
<div class="bg-white p-8 rounded shadow-md w-96">
<h1 class="text-2xl font-bold mb-4">Airo Messenger Login</h1>
<form id="login-form">
  <input type="email" id="email" placeholder="Email" class="border w-full p-2 mb-2 rounded" required>
  <input type="password" id="password" placeholder="Password" class="border w-full p-2 mb-4 rounded" required>
  <button type="submit" class="bg-blue-500 text-white w-full py-2 rounded">Login</button>
</form>
<p class="mt-4 text-sm">Don't have an account? <a href="/signup" class="text-blue-500">Sign Up</a></p>
<script>
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(res.ok){
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard';
    } else alert(data || 'Login failed');
});
</script>
</div>
</body>
</html>
    `);
});

// --------------------
// Signup Page
// --------------------
app.get('/signup', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Sign Up</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center h-screen">
<div class="bg-white p-8 rounded shadow-md w-96">
<h1 class="text-2xl font-bold mb-4">Sign Up</h1>
<form id="signup-form" enctype="multipart/form-data">
  <input type="text" name="username" placeholder="Username" class="border w-full p-2 mb-2 rounded" required>
  <input type="email" name="email" placeholder="Email" class="border w-full p-2 mb-2 rounded" required>
  <input type="password" name="password" placeholder="Password" class="border w-full p-2 mb-2 rounded" required>
  <input type="file" name="profile_photo" class="mb-2">
  <button type="submit" class="bg-green-500 text-white w-full py-2 rounded">Sign Up</button>
</form>
<p class="mt-4 text-sm">Already have an account? <a href="/login" class="text-blue-500">Login</a></p>
<script>
document.getElementById('signup-form').addEventListener('submit', async e=>{
    e.preventDefault();
    const formData = new FormData(e.target);
    const res = await fetch('/signup', { method:'POST', body: formData });
    const data = await res.json();
    if(res.ok){ alert('Account created'); window.location.href='/login'; }
    else alert(data || 'Signup failed');
});
</script>
</div>
</body>
</html>
    `);
});

// --------------------
// Signup POST
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
        if (email === ADMIN_EMAIL) user.isAdmin = true;
        await user.save();
        res.json({ message: 'User created' });
    } catch (e) {
        console.log(e);
        res.status(500).send('Error');
    }
});

// --------------------
// Login POST
// --------------------
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found');
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).send('Wrong password');
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (e) { console.log(e); res.status(500).send('Error'); }
});

// --------------------
// Dashboard Page
// --------------------
app.get('/dashboard', verifyToken, async (req, res) => {
    const currentUser = await User.findById(req.userId);
    const otherUsers = await User.find({ _id: { $ne: req.userId } });

    let usersListHTML = '';
    otherUsers.forEach(u => {
        usersListHTML += `<div class="p-2 border-b cursor-pointer hover:bg-gray-200 chat-user" data-id="${u._id}">
            <img src="${u.profile_photo || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full inline mr-2">
            <span>${u.username}</span>
        </div>`;
    });

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="/socket.io/socket.io.js"></script>
</head>
<body class="bg-gray-100 font-sans">
<div class="flex h-screen">
  <div class="w-1/4 bg-white border-r p-4 overflow-y-auto">
    <h2 class="font-bold mb-4">Contacts</h2>
    ${usersListHTML}
    <button id="view-status-btn" class="mt-4 bg-green-500 text-white px-3 py-1 rounded">View Status</button>
    <button id="post-status-btn" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded">Post Status</button>
  </div>
  <div class="flex-1 flex flex-col">
    <div id="chat-header" class="bg-white p-4 border-b font-bold">Select a contact to start chat</div>
    <div id="chat-messages" class="flex-1 p-4 overflow-y-auto bg-gray-50"></div>
    <div class="p-4 bg-white border-t flex">
      <input type="text" id="message-input" class="flex-1 border p-2 mr-2 rounded" placeholder="Type message...">
      <input type="file" id="media-input" class="mr-2">
      <button id="send-btn" class="bg-blue-500 text-white px-4 py-2 rounded">Send</button>
    </div>
  </div>
</div>

<div id="status-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
  <div class="bg-white p-4 rounded w-1/3">
    <h3 class="font-bold mb-2">Post Status</h3>
    <textarea id="status-content" class="border w-full p-2 mb-2" placeholder="Status text"></textarea>
    <input type="file" id="status-media" class="mb-2">
    <div class="flex justify-end">
      <button id="post-status-confirm" class="bg-blue-500 text-white px-3 py-1 rounded mr-2">Post</button>
      <button id="close-status" class="bg-gray-300 px-3 py-1 rounded">Cancel</button>
    </div>
  </div>
</div>

<script>
const socket = io(window.location.origin);
let selectedUserId = null;

document.querySelectorAll('.chat-user').forEach(el=>{
  el.addEventListener('click',()=>{
    selectedUserId = el.dataset.id;
    document.getElementById('chat-header').innerText = el.innerText;
    loadMessages(selectedUserId);
  });
});

async function loadMessages(otherUserId){
  const res = await fetch('/chat/'+otherUserId,{ headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') } });
  const messages = await res.json();
  const chatDiv = document.getElementById('chat-messages');
  chatDiv.innerHTML='';
  messages.forEach(m=>{
    const div = document.createElement('div');
    div.className = m.sender_id==='${currentUser._id}' ? 'text-right mb-2' : 'text-left mb-2';
    let content = m.content||'';
    if(m.media_url){
      if(m.media_type.startsWith('image/')) content+='<br><img src="'+m.media_url+'" class="max-w-xs inline">';
      if(m.media_type.startsWith('video/')) content+='<br><video src="'+m.media_url+'" class="max-w-xs inline" controls></video>';
    }
    div.innerHTML = content;
    chatDiv.appendChild(div);
  });
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

document.getElementById('send-btn').addEventListener('click',async()=>{
  const content = document.getElementById('message-input').value;
  const mediaFile = document.getElementById('media-input').files[0];
  if(!selectedUserId) return alert('Select a contact');
  const form = new FormData();
  form.append('content',content);
  if(mediaFile) form.append('media',mediaFile);
  const res = await fetch('/chat/'+selectedUserId,{ method:'POST', headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') }, body:form });
  const msg = await res.json();
  loadMessages(selectedUserId);
  document.getElementById('message-input').value='';
  document.getElementById('media-input').value='';
});

socket.on('receiveMessage',msg=>{
  if(msg.sender_id===selectedUserId||msg.receiver_id===selectedUserId) loadMessages(selectedUserId);
});

document.getElementById('view-status-btn').addEventListener('click',async()=>{
  const res = await fetch('/status',{ headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') } });
  const statuses = await res.json();
  alert('Statuses:\\n'+statuses.map(s=>s.content).join('\\n'));
});
document.getElementById('post-status-btn').addEventListener('click',()=>document.getElementById('status-modal').classList.remove('hidden'));
document.getElementById('close-status').addEventListener('click',()=>document.getElementById('status-modal').classList.add('hidden'));
document.getElementById('post-status-confirm').addEventListener('click',async()=>{
  const content = document.getElementById('status-content').value;
  const media = document.getElementById('status-media').files[0];
  const form = new FormData();
  form.append('content',content);
  if(media) form.append('media',media);
  await fetch('/status',{ method:'POST', headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') }, body:form });
  document.getElementById('status-modal').classList.add('hidden');
  alert('Status posted');
});
</script>
</body>
</html>
    `);
});

// --------------------
// Chat GET
// --------------------
app.get('/chat/:userId', verifyToken, async (req,res)=>{
  const messages = await Message.find({
    $or:[
      { sender_id:req.userId, receiver_id:req.params.userId },
      { sender_id:req.params.userId, receiver_id:req.userId }
    ]
  }).sort({ createdAt:1 });
  res.json(messages);
});

// --------------------
// Chat POST
// --------------------
app.post('/chat/:userId', verifyToken, async (req,res)=>{
  let media_url=null, media_type=null;
  if(req.files && req.files.media){
    const file = req.files.media;
    const fileName = Date.now() + '-' + file.name;
    const uploadPath = path.join(uploadsDir, fileName);
    await file.mv(uploadPath);
    media_url='/uploads/'+fileName;
    media_type=file.mimetype;
  }
  const message = new Message({ sender_id:req.userId, receiver_id:req.params.userId, content:req.body.content, media_url, media_type });
  await message.save();
  io.emit('receiveMessage', message);
  res.json(message);
});

// --------------------
// Status POST
// --------------------
app.post('/status', verifyToken, async (req,res)=>{
  let media_url=null, media_type=null;
  if(req.files && req.files.media){
    const file = req.files.media;
    const fileName = Date.now() + '-' + file.name;
    const uploadPath = path.join(uploadsDir, fileName);
    await file.mv(uploadPath);
    media_url='/uploads/'+fileName;
    media_type=file.mimetype;
  }
  const status = new Status({ user_id:req.userId, content:req.body.content, media_url, media_type, expire_at:new Date(Date.now()+24*60*60*1000) });
  await status.save();
  res.json(status);
});

// --------------------
// Status GET
// --------------------
app.get('/status', verifyToken, async (req,res)=>{
  const statuses = await Status.find({ expire_at: { $gt: new Date() } }).populate('user_id','username profile_photo');
  res.json(statuses);
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Airo running on port '+PORT));
