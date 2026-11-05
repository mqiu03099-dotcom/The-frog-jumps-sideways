const header = document.querySelector('.site-header, .detail-header');

if (header) {
  let headerFrame = 0;
  let headerValue = -1;

  const updateHeader = () => {
    headerFrame = 0;
    const progress = Math.round(Math.min(Math.max(window.scrollY / 420, 0), 1) * 50) / 50;

    if (progress === headerValue) {
      return;
    }

    headerValue = progress;
    document.documentElement.style.setProperty('--header-progress', progress);
  };

  const scheduleHeader = () => {
    if (!headerFrame) {
      headerFrame = requestAnimationFrame(updateHeader);
    }
  };

  scheduleHeader();
  window.addEventListener('scroll', scheduleHeader, { passive: true });
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
