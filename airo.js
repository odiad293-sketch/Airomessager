// --------------------
// User dashboard
// --------------------
app.get('/dashboard', verifyToken, async (req, res) => {
  const userResult = await pool.query('SELECT id, username, profile_photo FROM users WHERE id=$1', [req.userId]);
  const currentUser = userResult.rows[0];

  const otherUsers = (await pool.query('SELECT id, username, profile_photo FROM users WHERE id!=$1', [req.userId])).rows;

  let usersListHTML = '';
  otherUsers.forEach(u => {
    usersListHTML += `
      <div class="p-2 border-b cursor-pointer hover:bg-gray-200 chat-user" data-id="${u.id}">
        <img src="${u.profile_photo || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full inline mr-2">
        <span>${u.username}</span>
      </div>
    `;
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
  <!-- Contacts -->
  <div class="w-1/4 bg-white border-r p-4 overflow-y-auto">
    <h2 class="font-bold mb-4">Contacts</h2>
    ${usersListHTML}
    <button id="view-status-btn" class="mt-4 bg-green-500 text-white px-3 py-1 rounded">View Status</button>
    <button id="post-status-btn" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded">Post Status</button>
  </div>

  <!-- Chat area -->
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

<!-- Status modal -->
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
const socket = io();
let selectedUserId = null;

document.querySelectorAll('.chat-user').forEach(el => {
  el.addEventListener('click', () => {
    selectedUserId = el.dataset.id;
    document.getElementById('chat-header').innerText = el.innerText;
    loadMessages(selectedUserId);
  });
});

async function loadMessages(otherUserId) {
  const res = await fetch('/chat/' + otherUserId, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
  const messages = await res.json();
  const chatDiv = document.getElementById('chat-messages');
  chatDiv.innerHTML = '';
  messages.forEach(m => {
    const div = document.createElement('div');
    div.className = m.sender_id == ${currentUser.id} ? 'text-right mb-2' : 'text-left mb-2';
    let content = m.content || '';
    if(m.media_url){
      if(m.media_type.startsWith('image/')) content += '<br><img src="'+m.media_url+'" class="max-w-xs inline">';
      if(m.media_type.startsWith('video/')) content += '<br><video src="'+m.media_url+'" class="max-w-xs inline" controls></video>';
    }
    div.innerHTML = content;
    chatDiv.appendChild(div);
  });
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

document.getElementById('send-btn').addEventListener('click', async () => {
  const content = document.getElementById('message-input').value;
  const mediaFile = document.getElementById('media-input').files[0];
  if(!selectedUserId) return alert('Select a contact');
  const form = new FormData();
  form.append('content', content);
  if(mediaFile) form.append('media', mediaFile);
  const res = await fetch('/chat/' + selectedUserId, {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') },
    body: form
  });
  const msg = await res.json();
  loadMessages(selectedUserId);
  document.getElementById('message-input').value='';
  document.getElementById('media-input').value='';
});

// Socket.io receive message
socket.on('receiveMessage', (msg)=>{
  if(msg.sender_id==selectedUserId || msg.receiver_id==selectedUserId) loadMessages(selectedUserId);
});

// Status modal
document.getElementById('view-status-btn').addEventListener('click', async () => {
  const res = await fetch('/status', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
  const statuses = await res.json();
  alert('Statuses:\\n' + statuses.map(s=>s.content).join('\\n'));
});

document.getElementById('post-status-btn').addEventListener('click', ()=>{
  document.getElementById('status-modal').classList.remove('hidden');
});
document.getElementById('close-status').addEventListener('click', ()=>{
  document.getElementById('status-modal').classList.add('hidden');
});
document.getElementById('post-status-confirm').addEventListener('click', async ()=>{
  const content = document.getElementById('status-content').value;
  const media = document.getElementById('status-media').files[0];
  const form = new FormData();
  form.append('content', content);
  if(media) form.append('media', media);
  const res = await fetch('/status', {
    method:'POST',
    headers:{ 'Authorization':'Bearer '+localStorage.getItem('token') },
    body: form
  });
  document.getElementById('status-modal').classList.add('hidden');
  alert('Status posted');
});
</script>
</body>
</html>
  `);
});

// --------------------
// Admin dashboard
// --------------------
app.get('/admin/dashboard', verifyToken, verifyAdmin, async (req,res)=>{
  const users = (await pool.query('SELECT id,username,email,profile_photo FROM users')).rows;
  const messages = (await pool.query('SELECT * FROM messages ORDER BY created_at DESC')).rows;
  const statuses = (await pool.query('SELECT * FROM status ORDER BY created_at DESC')).rows;

  let usersHTML='', messagesHTML='', statusesHTML='';
  users.forEach(u=>usersHTML+=`<tr><td>${u.id}</td><td>${u.username}</td><td>${u.email}</td><td>${u.profile_photo||''}</td></tr>`);
  messages.forEach(m=>messagesHTML+=`<tr><td>${m.id}</td><td>${m.sender_id}</td><td>${m.receiver_id}</td><td>${m.content||''}</td></tr>`);
  statuses.forEach(s=>statusesHTML+=`<tr><td>${s.id}</td><td>${s.user_id}</td><td>${s.content||''}</td></tr>`);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Admin Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 font-sans p-4">
<h1 class="text-3xl font-bold mb-4">Admin Dashboard</h1>

<h2 class="font-bold mt-4">Users</h2>
<table class="table-auto border mb-4"><tr><th>ID</th><th>Username</th><th>Email</th><th>Photo</th></tr>${usersHTML}</table>

<h2 class="font-bold mt-4">Messages</h2>
<table class="table-auto border mb-4"><tr><th>ID</th><th>Sender</th><th>Receiver</th><th>Content</th></tr>${messagesHTML}</table>

<h2 class="font-bold mt-4">Statuses</h2>
<table class="table-auto border mb-4"><tr><th>ID</th><th>User</th><th>Content</th></tr>${statusesHTML}</table>
</body>
</html>
  `);
});
