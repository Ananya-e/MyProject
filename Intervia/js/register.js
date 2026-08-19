const password=document.getElementById("password");
const confirmPassword=document.getElementById("confirmPassword");
const togglePassword=document.getElementById("togglePassword");
const toggleConfirmPassword=document.getElementById("toggleConfirmPassword");
const policyOverlay=document.getElementById("policyOverlay");
const policyClose=document.getElementById("policyClose");
const termsLink=document.getElementById("termsLink");
const privacyLink=document.getElementById("privacyLink");
const registerForm=document.getElementById("registerForm");

togglePassword.addEventListener("click",()=>{
password.type=password.type==="password"?"text":"password";
});

toggleConfirmPassword.addEventListener("click",()=>{
confirmPassword.type=confirmPassword.type==="password"?"text":"password";
});

function openPolicy(){
policyOverlay.classList.add("active");
document.body.style.overflow="hidden";
}

function closePolicy(){
policyOverlay.classList.remove("active");
document.body.style.overflow="";
}

termsLink.addEventListener("click",e=>{
e.preventDefault();
openPolicy();
});

privacyLink.addEventListener("click",e=>{
e.preventDefault();
openPolicy();
});

policyClose.addEventListener("click",closePolicy);

policyOverlay.addEventListener("click",e=>{
if(e.target===policyOverlay)closePolicy();
});

document.addEventListener("keydown",e=>{
if(e.key==="Escape"&&policyOverlay.classList.contains("active"))closePolicy();
});

registerForm.addEventListener("submit",async e=>{
e.preventDefault();
const full_name=document.getElementById("name").value.trim();
const email=document.getElementById("email").value.trim();
const passwordValue=password.value;
const confirmPasswordValue=confirmPassword.value;

if(passwordValue!==confirmPasswordValue){
showToast("Passwords do not match","error");
return;
}

try{
const response=await fetch("http://127.0.0.1:5000/register",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
full_name,
email,
password:passwordValue
})
});
const result=await response.json();

if(!response.ok||result.error||result.errors){
const message=result.error||result.errors?.[0]?.message||"Registration failed.";
showToast(message,"error");
return;
}

const user=result.user;
localStorage.setItem("user",JSON.stringify(user));
localStorage.setItem("user_id",user.id);
showToast("Registration successful","success");
setTimeout(()=>window.location.href="dashboard.html",1000);
}catch(error){
showToast("Cannot connect to the server","error");
}
});