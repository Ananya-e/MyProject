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
