const API_BASE=window.API_BASE||"http://127.0.0.1:5000";

document.addEventListener("DOMContentLoaded",()=>{

const loginForm=document.getElementById("loginForm");
const passwordInput=document.getElementById("password");
const togglePassword=document.getElementById("togglePassword");
const emailInput=document.getElementById("email");

function showLoginToast(message,type="error"){
if(typeof showToast==="function"){
showToast(message,type);
return;
}

const toast=document.getElementById("toast");

if(!toast){
return;
}

toast.textContent=message;
toast.classList.add("show");

setTimeout(()=>{
toast.classList.remove("show");
},3000);
}

togglePassword?.addEventListener("click",()=>{

if(!passwordInput){
return;
}

const isPassword=passwordInput.type==="password";

passwordInput.type=isPassword?"text":"password";

togglePassword.setAttribute(
"aria-label",
isPassword?"Hide password":"Show password"
);

});

loginForm?.addEventListener("submit",async event=>{

event.preventDefault();

const email=emailInput?.value.trim()||"";
const password=passwordInput?.value||"";

if(!email){
showLoginToast("Please enter your email address.","error");
return;
}

if(!password){
showLoginToast("Please enter your password.","error");
return;
}

const signInButton=loginForm.querySelector(".sign-in-btn");

if(signInButton){
signInButton.disabled=true;
signInButton.innerHTML="Signing In...";
}

try{

const response=await fetch(
`${API_BASE}/login`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
email:email,
password:password
})
}
);

let result;

try{
result=await response.json();
}catch{
throw new Error(
`Server returned an invalid response (${response.status}).`
);
}

if(!response.ok||!result.success){

showLoginToast(
result?.message||"Invalid email or password.",
"error"
);

return;
}

const user=result.user;

if(!user||!user.id){

showLoginToast(
"Login response is missing user information.",
"error"
);

return;
}

localStorage.removeItem("user");
localStorage.removeItem("user_id");
localStorage.removeItem("user_email");
localStorage.removeItem("user_name");
localStorage.removeItem("target_role");
localStorage.removeItem("experience_level");
localStorage.removeItem("resume_analysis");

sessionStorage.removeItem("current_interview");
sessionStorage.removeItem("interview_result");

localStorage.setItem(
"user",
JSON.stringify(user)
);

localStorage.setItem(
"user_id",
String(user.id)
);

localStorage.setItem(
"user_email",
user.email||email
);

localStorage.setItem(
"user_name",
user.full_name||"Candidate"
);

if(user.target_role){
localStorage.setItem(
"target_role",
user.target_role
);
}

showLoginToast(
"Login successful.",
"success"
);

setTimeout(()=>{
window.location.href="dashboard.html";
},800);

}catch(error){

console.error("Login error:",error);

showLoginToast(
"Cannot connect to the server.",
"error"
);

}finally{

if(signInButton){
signInButton.disabled=false;
signInButton.innerHTML="Sign In";
}

}

});

});