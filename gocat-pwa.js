(function(){
"use strict";
let installPrompt = null;
const button = document.createElement("button");
button.type = "button";
button.className = "gocat-install-btn";
button.id = "gocatInstallBtn";
button.innerHTML = '<span aria-hidden="true">⇩</span><span>Install GoCat</span>';
button.hidden = true;
button.addEventListener("click", async function(){
  if(!installPrompt) return;
  installPrompt.prompt();
  try{
    const choice = await installPrompt.userChoice;
    if(choice && choice.outcome === "accepted") button.hidden = true;
  }finally{ installPrompt = null; }
});
function mount(){
  const actions = document.querySelector(".topbar-actions");
  if(actions && !button.isConnected) actions.insertBefore(button, actions.firstChild);
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",mount,{once:true}); else mount();
window.addEventListener("beforeinstallprompt",function(event){
  event.preventDefault();
  installPrompt = event;
  mount();
  button.hidden = false;
});
window.addEventListener("appinstalled",function(){button.hidden=true;installPrompt=null;});
if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("/sw.js").catch(function(error){console.warn("GoCat offline support could not start:",error);});
  });
}
const status=document.createElement("div");
status.className="gocat-offline-status";
status.setAttribute("role","status");
status.setAttribute("aria-live","polite");
document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(status);});
function updateConnection(){
  if(!status.isConnected) document.body.appendChild(status);
  status.textContent=navigator.onLine?"You're back online.":"You're offline. Cached GoCat pages may still open; live feeds and uploads need internet.";
  status.classList.add("is-visible");
  clearTimeout(updateConnection.timer);
  updateConnection.timer=setTimeout(()=>status.classList.remove("is-visible"),4200);
}
window.addEventListener("offline",updateConnection);
window.addEventListener("online",updateConnection);
})();