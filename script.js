const button=document.querySelector('.menu-toggle');
const menu=document.querySelector('.menu');
button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));button.querySelector('span').textContent=open?'+':'−';menu.classList.toggle('open',!open)});
menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{menu.classList.remove('open');button.setAttribute('aria-expanded','false');button.querySelector('span').textContent='+'}));

const hero=document.querySelector('.connection-story');
let ticking=false;
function updateHero(){
  const rect=hero.getBoundingClientRect();
  const distance=Math.max(1,hero.offsetHeight-window.innerHeight);
  const progress=Math.min(1,Math.max(0,-rect.top/distance));
  hero.style.setProperty('--scroll',progress.toFixed(3));
  ticking=false;
}
window.addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(updateHero);ticking=true}},{passive:true});
window.addEventListener('resize',updateHero);
updateHero();
