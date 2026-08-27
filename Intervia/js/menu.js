document.addEventListener("DOMContentLoaded",()=>{
const menuBtn=document.getElementById("menuBtn");
const sideMenu=document.getElementById("sideMenu");
const menuOverlay=document.getElementById("menuOverlay");
const menuClose=document.getElementById("menuClose");
const logoutBtn=document.getElementById("logoutBtn");
const logoutOverlay=document.getElementById("logoutOverlay");
const cancelLogout=document.getElementById("cancelLogout");
const confirmLogout=document.getElementById("confirmLogout");

function openMenu(){
sideMenu?.classList.add("open");
menuOverlay?.classList.add("active");
document.body.style.overflow="hidden";
}

function closeMenu(){
sideMenu?.classList.remove("open");
menuOverlay?.classList.remove("active");
document.body.style.overflow="";
}

menuBtn?.addEventListener("click",openMenu);
menuClose?.addEventListener("click",closeMenu);
menuOverlay?.addEventListener("click",closeMenu);

document.addEventListener("keydown",event=>{
if(event.key==="Escape"){
closeMenu();
logoutOverlay?.classList.remove("active");
}
});

const currentPage=window.location.pathname.split("/").pop()||"dashboard.html";

document.querySelectorAll(".side-menu-nav a").forEach(link=>{
const linkPage=link.getAttribute("href")?.split("/").pop();
if(linkPage===currentPage){
link.classList.add("active");
}
});

logoutBtn?.addEventListener("click",()=>{
closeMenu();
logoutOverlay?.classList.add("active");
});

cancelLogout?.addEventListener("click",()=>{
logoutOverlay?.classList.remove("active");
});

logoutOverlay?.addEventListener("click",event=>{
if(event.target===logoutOverlay){
logoutOverlay.classList.remove("active");
}
});

confirmLogout?.addEventListener("click",()=>{
localStorage.removeItem("user");
localStorage.removeItem("user_id");
localStorage.removeItem("user_email");
localStorage.removeItem("user_name");
localStorage.removeItem("resume_analysis");
sessionStorage.removeItem("current_interview");
window.location.href="login.html";
});
});