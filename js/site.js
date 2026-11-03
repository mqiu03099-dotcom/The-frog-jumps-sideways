document.documentElement.classList.add('anim-ready');

const revealItems = document.querySelectorAll('.reveal');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('.site-header, .detail-header');

if (header) {
  const updateHeader = () => {
    const progress = Math.min(Math.max(window.scrollY / 420, 0), 1);
    document.documentElement.style.setProperty('--header-progress', progress);
  };

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
}

if (reduceMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-in'));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const item = entry.target;
        item.style.transitionDelay = `${Number(item.dataset.delay || 0)}ms`;
        item.classList.add('is-in');
        observer.unobserve(item);
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.15 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

const copyItems = document.querySelectorAll('[data-copy]');

if (copyItems.length) {
  let toastTimer;

  const showToast = (message, isError) => {
    let toast = document.querySelector('.copy-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'copy-toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }

    toast.textContent = message;
    toast.classList.toggle('copy-toast--error', isError);
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2000);
  };

  // shortcut: 仅非安全上下文走 execCommand 兜底，个别移动端可能复制失败
  const copyFallback = (text) => {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.append(field);
    field.select();
    const done = document.execCommand('copy');
    field.remove();
    return done;
  };

  copyItems.forEach((item) => {
    item.addEventListener('click', async () => {
      let done = false;

      try {
        await navigator.clipboard.writeText(item.dataset.copy);
        done = true;
      } catch {
        done = copyFallback(item.dataset.copy);
      }

      showToast(done ? `已复制${item.dataset.copyLabel}` : '复制失败，请手动选择', !done);
    });
  });
}
