/* Aalynex MAIN UI v8.7 — hide Tawk support bubble only while app Messages is active.
   It can still be opened from the official Contact Us / FAQ links. */
(function(){
 'use strict';
 let last=null;
 function visible(id){const n=document.getElementById(id);return !!n&&getComputedStyle(n).display!=='none';}
 function onMessagePage(){
   return (visible('screen-creator')&&!!document.querySelector('#screen-creator .nav-item[data-page="chat"].active')) ||
          (visible('screen-freelancer')&&!!document.querySelector('#screen-freelancer .nav-item[data-page="chat"].active'));
 }
 function refresh(force){
   const shouldHide=onMessagePage();
   const api=window.Tawk_API;
   if(!api || (shouldHide===last && !force))return;
   const method=shouldHide?'hideWidget':'showWidget';
   if(typeof api[method]!=='function')return;
   try{api[method]();last=shouldHide;}catch(_){/* Tawk may still be initializing. */}
 }
 // Tawk loads asynchronously. Preserve existing callback if another integration installed one.
 const oldOnLoad=window.Tawk_API&&window.Tawk_API.onLoad;
 if(window.Tawk_API){window.Tawk_API.onLoad=function(){
   if(typeof oldOnLoad==='function')oldOnLoad.apply(this,arguments); refresh(true);
 };}
 document.addEventListener('click',()=>setTimeout(()=>refresh(false),0),true);
 document.addEventListener('DOMContentLoaded',()=>refresh(true));
 setInterval(()=>refresh(false),1500);
})();
