document.addEventListener("DOMContentLoaded",()=>{
const API_BASE="http://127.0.0.1:5000";

const loginOverlay=document.getElementById("loginOverlay");
const loginForm=document.getElementById("adminLoginForm");
const loginSubmit=document.getElementById("loginSubmit");
const loginClose=document.getElementById("loginClose");

const passwordToggle=document.getElementById("passwordToggle");
const adminPassword=document.getElementById("adminPassword");
const logoutBtn=document.getElementById("logoutBtn");
const userSearch=document.getElementById("userSearch");
const userSort=document.getElementById("userSort");
const dateRange=document.getElementById("dateRange");
const usersTableBody=document.getElementById("usersTableBody");
const emptyUsers=document.getElementById("emptyUsers");

let users=[];

function showLogin(){
loginOverlay.classList.add("active");
document.body.style.overflow="hidden";
}

function hideLogin(){
loginOverlay.classList.remove("active");
document.body.style.overflow="";
}
loginClose.addEventListener("click",()=>{
window.location.href="index.html";
});
function showMessage(message,type="error"){
if(typeof showToast==="function"){
showToast(message,type);
}
}

function formatDate(value){
if(!value){
return"—";
}

const date=new Date(value);

if(Number.isNaN(date.getTime())){
return"—";
}

return date.toLocaleDateString([],{
month:"short",
day:"numeric",
year:"numeric"
});
}

function getLastActive(value){
if(!value){
return{
label:"—",
recent:false
};
}

const date=new Date(value);

if(Number.isNaN(date.getTime())){
return{
label:"—",
recent:false
};
}

const diffMinutes=Math.floor(
(Date.now()-date.getTime())/60000
);

if(diffMinutes<5){
return{
label:"Active now",
recent:false
};
}

if(diffMinutes<60){
return{
label:`${diffMinutes} mins ago`,
recent:true
};
}

const diffHours=Math.floor(diffMinutes/60);

if(diffHours<24){
return{
label:`${diffHours} hour${diffHours===1?"":"s"} ago`,
recent:true
};
}

const diffDays=Math.floor(diffHours/24);

if(diffDays===1){
return{
label:"1 day ago",
recent:true
};
}

return{
label:`${diffDays} days ago`,
recent:true
};
}

function getAverageScore(user){
const score=Number(user.average_score);

if(Number.isFinite(score)){
return Math.round(score);
}

return 0;
}

function getInterviewCount(user){
const value=Number(user.total_interviews);

return Number.isFinite(value)
?value
:0;
}

function getCompletedCount(user){
const value=Number(user.completed_interviews);

return Number.isFinite(value)
?value
:0;
}


function sortUsers(list){
const sorted=[...list];

if(userSort.value==="oldest"){
return sorted.sort((a,b)=>{
return new Date(a.created_at||0)-
new Date(b.created_at||0);
});
}

if(userSort.value==="interviews"){
return sorted.sort((a,b)=>{
return getInterviewCount(b)-
getInterviewCount(a);
});
}

if(userSort.value==="score"){
return sorted.sort((a,b)=>{
return getAverageScore(b)-
getAverageScore(a);
});
}

if(userSort.value==="name"){
return sorted.sort((a,b)=>{
return String(a.full_name||"").localeCompare(
String(b.full_name||"")
);
});
}

return sorted.sort((a,b)=>{
return new Date(b.created_at||0)-
new Date(a.created_at||0);
});
}

function filterUsers(){
const query=userSearch.value.trim().toLowerCase();

let filtered=users;

if(query){
filtered=users.filter(user=>{
const name=String(user.full_name||"").toLowerCase();
const email=String(user.email||"").toLowerCase();

return(
name.includes(query)||
email.includes(query)
);
});
}

return sortUsers(filtered);
}

function renderUsers(){
const filtered=filterUsers();

usersTableBody.innerHTML="";

if(!filtered.length){
emptyUsers.classList.add("show");
return;
}

emptyUsers.classList.remove("show");

filtered.forEach((user,index)=>{
const name=user.full_name||"User";
const initial=name.charAt(0).toUpperCase();
const score=getAverageScore(user);
const active=getLastActive(user.last_active);

const row=document.createElement("tr");

row.innerHTML=`
<td class="user-number">${index+1}</td>
<td>
<div class="user-name-cell">
<div class="user-avatar">${escapeHtml(initial)}</div>
<div class="user-name-info">
<strong>${escapeHtml(name)}</strong>
</div>
</div>
</td>
<td class="user-email">${escapeHtml(user.email||"—")}</td>
<td class="user-date">${escapeHtml(formatDate(user.created_at))}</td>
<td class="user-number-value">${getInterviewCount(user)}</td>
<td class="user-number-value">${getCompletedCount(user)}</td>
<td>
<span class="score-pill ${score>=80?"high":""}">
${score}%
</span>
</td>
<td>
<div class="last-active">
<span class="activity-dot ${active.recent?"recent":""}"></span>
<span>${escapeHtml(active.label)}</span>
</div>
</td>
`;

usersTableBody.appendChild(row);
});
}

function updateOverview(data){
document.getElementById("totalUsers").textContent=
data.total_users??users.length;

document.getElementById("totalInterviews").textContent=
data.total_interviews??0;

document.getElementById("completedInterviews").textContent=
data.completed_interviews??0;

document.getElementById("averageScore").textContent=
`${Math.round(Number(data.average_score)||0)}%`;

document.getElementById("userCount").textContent=
`(${data.total_users??users.length})`;
}

async function loadDashboard(){
try{
const response=await fetch(
`${API_BASE}/api/admin/dashboard?range=${encodeURIComponent(dateRange.value)}`,
{
method:"GET",
credentials:"include"
}
);

if(response.status===401){
showLogin();
return;
}

const data=await response.json();

if(!response.ok){
throw new Error(
data.error||
"Unable to load admin dashboard."
);
}

users=Array.isArray(data.users)
?data.users
:[];

updateOverview(data);
renderUsers();

}catch(error){
console.error("Admin dashboard error:",error);
showMessage(
"Unable to load admin dashboard.",
"error"
);
}
}

loginForm.addEventListener("submit",async event=>{
event.preventDefault();

const email=document.getElementById("adminEmail").value.trim();
const password=adminPassword.value;

if(!email||!password){
showMessage(
"Enter your admin email and password.",
"error"
);
return;
}

loginSubmit.disabled=true;

try{
const response=await fetch(
`${API_BASE}/api/admin/login`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
credentials:"include",
body:JSON.stringify({
email,
password
})
}
);

const data=await response.json();

if(!response.ok){
throw new Error(
data.error||
"Invalid admin credentials."
);
}

hideLogin();
loginForm.reset();
await loadDashboard();

}catch(error){
console.error("Admin login error:",error);
showMessage(
error.message||
"Invalid admin credentials.",
"error"
);
}finally{
loginSubmit.disabled=false;
}
});

passwordToggle.addEventListener("click",()=>{
const isPassword=
adminPassword.type==="password";

adminPassword.type=
isPassword
?"text"
:"password";

passwordToggle.innerHTML=
isPassword
?'<i class="fa-regular fa-eye-slash"></i>'
:'<i class="fa-regular fa-eye"></i>';
});

logoutBtn.addEventListener("click",async()=>{
try{
await fetch(
`${API_BASE}/api/admin/logout`,
{
method:"POST",
credentials:"include"
}
);
}catch(error){
console.error("Admin logout error:",error);
}

window.location.href="index.html";
});

userSearch.addEventListener("input",renderUsers);
userSort.addEventListener("change",renderUsers);

dateRange.addEventListener("change",loadDashboard);

function escapeHtml(value){
return String(value)
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");
}

loadDashboard();
});