const menuBtn = document.getElementById("menuBtn");
const nav = document.querySelector(".nav-links");
menuBtn.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  nav.style.display = open ? "flex" : "";
  nav.style.position = open ? "absolute" : "";
  nav.style.top = open ? "65px" : "";
  nav.style.left = "0";
  nav.style.right = "0";
  nav.style.flexDirection = open ? "column" : "";
  nav.style.alignItems = open ? "flex-start" : "";
  nav.style.gap = open ? "18px" : "";
  nav.style.padding = open ? "20px" : "";
  nav.style.background = open ? "#fff" : "";
  nav.style.border = open ? "1px solid #e5eaf3" : "";
  nav.style.borderRadius = open ? "14px" : "";
  nav.style.boxShadow = open ? "0 15px 35px rgba(20,40,90,.12)" : "";
});
const demoCover=document.getElementById("demoCover");
const demoVideo=document.getElementById("demoVideo");

if(demoCover&&demoVideo){
demoCover.addEventListener("click",()=>{
demoCover.style.display="none";
demoVideo.classList.add("active");
demoVideo.currentTime=0;
demoVideo.play();
});

demoVideo.addEventListener("ended",()=>{
demoVideo.pause();
demoVideo.currentTime=0;
demoVideo.classList.remove("active");
demoCover.style.display="block";
});
}