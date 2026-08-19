function showToast(message,type="info"){
    const existing=document.querySelector(".toast");
    if(existing) existing.remove();
    const toast=document.createElement("div");
    toast.className=`toast toast-${type}`;
    const icons={
        success:"✓",
        error:"×",
        warning:"!",
        info:"i"
    };
    toast.innerHTML=`<span class="toast-icon">${icons[type]||icons.info}</span><span class="toast-message">${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(()=>toast.classList.add("show"));
    setTimeout(()=>{
        toast.classList.remove("show");
        setTimeout(()=>toast.remove(),300);
    },3500);
}