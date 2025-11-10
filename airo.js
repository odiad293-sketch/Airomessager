// --------------------
// airo.js - Full WhatsApp-style Mobile Messenger
// --------------------
const express = require('express');
const fileUpload = require('express-fileupload');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// --------------------
// MongoDB Connection
// --------------------
const MONGO_URI = 'mongodb+srv://etiosaodia:destiny@cluster0.a1hcszb.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --------------------
// Schemas
// --------------------
const { Schema, model } = mongoose;

const userSchema = new Schema({
  fullName: String,
  username: { type: String, unique: true },
  password: String,
  dob: Date,
  email: String,
  bio: String,
  profilePhoto: String
}, { timestamps: true });
const User = model('User', userSchema);

const messageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  media: String,
  mediaType: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = model('Message', messageSchema);

const statusSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  media: String,
  mediaType: String,
  expireAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const Status = model('Status', statusSchema);

// --------------------
// Routes
// --------------------

// Root redirect
app.get('/', (req,res)=>res.redirect('/login'));

// --------------------
// Login Page
// --------------------
app.get('/login', (req,res)=>{
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Messenger Login</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-blue-100 flex items-center justify-center h-screen">
<div class="bg-white p-5 rounded shadow w-full max-w-sm">
<h1 class="text-2xl font-bold mb-4 text-center">Airo Messenger</h1>
<form id="loginForm" class="flex flex-col gap-3">
  <input type="text" placeholder="Username" id="username" class="border p-2 rounded" required>
  <input type="password" placeholder="Password" id="password" class="border p-2 rounded" required>
  <button type="submit" class="bg-blue-500 text-white p-2 rounded">Login</button>
</form>
<div class="mt-4 text-center">
  <button id="signupBtn" class="text-blue-700 underline">Sign Up</button>
</div>
<script>
document.getElementById('signupBtn').onclick = ()=>{ window.location='/signup'; };
document.getElementById('loginForm').onsubmit=async(e)=>{
  e.preventDefault();
  const username=document.getElementById('username').value;
  const password=document.getElementById('password').value;
  const res=await fetch('/api/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,password})
  });
  const data=await res.json();
  if(data.error){ alert(data.error); return; }
  localStorage.setItem('userId',data.userId);
  window.location='/chat';
};
</script>
</div>
</body>
</html>
  `);
});

// --------------------
// Signup Page
// --------------------
app.get('/signup',(req,res)=>{
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Messenger Sign Up</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-blue-100 flex items-center justify-center h-screen">
<div class="bg-white p-5 rounded shadow w-full max-w-sm">
<h1 class="text-2xl font-bold mb-4 text-center">Sign Up</h1>
<form id="signupForm" class="flex flex-col gap-2">
  <input type="text" placeholder="Full Name" id="fullName" class="border p-2 rounded" required>
  <input type="text" placeholder="Username" id="username" class="border p-2 rounded" required>
  <input type="password" placeholder="Password" id="password" class="border p-2 rounded" required>
  <input type="date" placeholder="Date of Birth" id="dob" class="border p-2 rounded" required>
  <input type="email" placeholder="Email" id="email" class="border p-2 rounded" required>
  <textarea placeholder="Bio" id="bio" class="border p-2 rounded"></textarea>
  <button type="submit" class="bg-blue-500 text-white p-2 rounded">Sign Up</button>
</form>
<div class="mt-4 text-center">
  <button id="loginBtn" class="text-blue-700 underline">Back to Login</button>
</div>
<script>
document.getElementById('loginBtn').onclick = ()=>{ window.location='/login'; };
document.getElementById('signupForm').onsubmit=async(e)=>{
  e.preventDefault();
  const fullName=document.getElementById('fullName').value;
  const username=document.getElementById('username').value;
  const password=document.getElementById('password').value;
  const dob=document.getElementById('dob').value;
  const email=document.getElementById('email').value;
  const bio=document.getElementById('bio').value;
  const res=await fetch('/api/signup',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fullName,username,password,dob,email,bio})
  });
  const data=await res.json();
  if(data.error){ alert(data.error); return; }
  alert('Sign-up successful! You can now login.');
  window.location='/login';
};
</script>
</div>
</body>
</html>
  `);
});

// --------------------
// API Endpoints
// --------------------

// Signup API
app.post('/api/signup',async(req,res)=>{
  try{
    const { fullName,username,password,dob,email,bio } = req.body;
    if(!fullName||!username||!password||!dob||!email) return res.json({error:'Missing fields'});
    const exists=await User.findOne({username});
    if(exists) return res.json({error:'Username exists'});
    const hash=await bcrypt.hash(password,10);
    const user=new User({fullName,username,password:hash,dob,email,bio});
    await user.save();
    return res.json({success:true,userId:user._id});
  }catch(e){console.log(e);return res.json({error:'Server error'});}
});

// Login API
app.post('/api/login',async(req,res)=>{
  try{
    const { username,password }=req.body;
    if(!username||!password) return res.json({error:'Missing fields'});
    const user=await User.findOne({username});
    if(!user) return res.json({error:'User not found'});
    const valid=await bcrypt.compare(password,user.password);
    if(!valid) return res.json({error:'Wrong password'});
    return res.json({success:true,userId:user._id});
  }catch(e){console.log(e);return res.json({error:'Server error'});}
});

// Get all users
app.get('/api/users',async(req,res)=>{
  const users=await User.find();
  res.json(users);
});

// --------------------
// Chat Page (Mobile Only)
// --------------------
app.get('/chat',async(req,res)=>{
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Airo Chat</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<script src="/socket.io/socket.io.js"></script>
</head>
<body class="bg-blue-50 h-screen flex flex-col">
<div class="flex-1 flex flex-col">
  <div id="contacts" class="bg-white p-2 border-b flex overflow-x-auto"></div>
  <div id="chatHeader" class="bg-white p-2 font-bold border-b">Select Contact</div>
  <div id="messages" class="flex-1 p-2 overflow-y-auto bg-gray-100"></div>
  <div class="p-2 bg-white flex gap-2 border-t">
    <input type="text" id="messageInput" placeholder="Message" class="flex-1 border p-2 rounded">
    <input type="file" id="mediaInput">
    <button id="sendBtn" class="bg-blue-500 text-white px-3 rounded">Send</button>
  </div>
</div>
<script>
const socket=io();
let selectedUser=null;
const userId=localStorage.getItem('userId');

async function loadContacts(){
  const res=await fetch('/api/users');
  const users=await res.json();
  const contactsDiv=document.getElementById('contacts');
  contactsDiv.innerHTML='';
  users.forEach(u=>{
    if(u._id===userId) return;
    const div=document.createElement('div');
    div.className='p-2 border-r cursor-pointer';
    div.innerText=u.username;
    div.onclick=()=>{ selectedUser=u._id; document.getElementById('chatHeader').innerText=u.username; loadMessages(); };
    contactsDiv.appendChild(div);
  });
}

async function loadMessages(){
  if(!selectedUser) return;
  const res=await fetch(\`/api/messages/\${userId}/\${selectedUser}\`);
  const msgs=await res.json();
  const msgDiv=document.getElementById('messages');
  msgDiv.innerHTML='';
  msgs.forEach(m=>{
    const div=document.createElement('div');
    div.className=m.sender===userId?'text-right mb-1':'text-left mb-1';
    let content=m.content||'';
    if(m.media){
      if(m.mediaType.startsWith('image')) content+='<br><img src="'+m.media+'" class="max-w-xs">';
      if(m.mediaType.startsWith('video')) content+='<br><video src="'+m.media+'" class="max-w-xs" controls></video>';
    }
    div.innerHTML=content;
    msgDiv.appendChild(div);
  });
  msgDiv.scrollTop=msgDiv.scrollHeight;
}

document.getElementById('sendBtn').onclick=async()=>{
  if(!selectedUser) return alert('Select a contact');
  const content=document.getElementById('messageInput').value;
  const media=document.getElementById('mediaInput').files[0];
  const form=new FormData();
  form.append('content',content);
  if(media) form.append('media',media);
  form.append('receiver',selectedUser);
  form.append('sender',userId);
  await fetch('/api/messages',{method:'POST',body:form});
  document.getElementById('messageInput').value='';
  document.getElementById('mediaInput').value='';
  loadMessages();
};

socket.on('newMessage',msg=>{
  if(msg.sender===selectedUser||msg.receiver===selectedUser) loadMessages();
});

loadContacts();
</script>
</body>
</html>
  `);
});

// --------------------
// API for Messages
// --------------------
app.post('/api/messages',async(req,res)=>{
  try{
    const { sender, receiver, content }=req.body;
    let media=null, mediaType=null;
    if(req.files && req.files.media){
      const file=req.files.media;
      const fileName=Date.now()+'-'+file.name;
      const filePath=path.join(uploadsDir,fileName);
      await file.mv(filePath);
      media='/uploads/'+fileName;
      mediaType=file.mimetype;
    }
    const message=new Message({sender,receiver,content,media,mediaType});
    await message.save();
    io.emit('newMessage',message);
    res.json({success:true});
  }catch(e){console.log(e);res.json({error:'Error sending message'});}
});

app.get('/api/messages/:userId/:otherUser',async(req,res)=>{
  const { userId, otherUser }=req.params;
  const msgs=await Message.find({
    $or:[
      { sender:userId, receiver:otherUser },
      { sender:otherUser, receiver:userId }
    ]
  }).sort({createdAt:1});
  res.json(msgs);
});

// --------------------
// Status API
// --------------------
app.post('/api/status',async(req,res)=>{
  try{
    const { user, content }=req.body;
    let media=null, mediaType=null;
    if(req.files && req.files.media){
      const file=req.files.media;
      if(file.mimetype.startsWith('video/') && file.size>30*1024*1024) return res.json({error:'Video too long'});
      const fileName=Date.now()+'-'+file.name;
      const filePath=path.join(uploadsDir,fileName);
      await file.mv(filePath);
      media='/uploads/'+fileName;
      mediaType=file.mimetype;
    }
    const status=new Status({user,content,media,mediaType,expireAt:new Date(Date.now()+24*60*60*1000)});
    await status.save();
    res.json({success:true});
  }catch(e){console.log(e);res.json({error:'Error posting status'});}
});

app.get('/api/status',async(req,res)=>{
  const statuses=await Status.find({expireAt:{$gt:new Date()}}).populate('user','username profilePhoto');
  res.json(statuses);
});

// --------------------
// Start Server
// --------------------
server.listen(PORT, () => {
  console.log("Airo Messenger mobile-only running on port " + PORT);
});
