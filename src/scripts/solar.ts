const solar = document.querySelector<HTMLElement>('[data-solar]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

if (solar) {
  let visible = true;
  let frame = 0;
  const update = () => {
    frame = 0;
    const amount = Math.min(window.scrollY / Math.max(solar.offsetHeight, 1), 1);
    solar.style.setProperty('--scroll-tilt', (amount * 12) + 'deg');
    solar.style.setProperty('--scroll-lift', (-amount * 32) + 'px');
  };
  const schedule = () => {
    if (visible && !reduce.matches && !frame) frame = requestAnimationFrame(update);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    solar.classList.toggle('solar-paused', !visible);
    schedule();
  });
  observer.observe(solar);
  addEventListener('scroll', schedule, { passive: true });
  reduce.addEventListener('change', schedule);
  schedule();
}
