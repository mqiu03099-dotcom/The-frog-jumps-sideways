(() => {
  const collection = document.body.dataset.collection;
  const data = window.ASSET_MANIFEST?.[collection];

  if (!data) {
    return;
  }

  const BUFFER_ROWS = 2;
  const files = data.files;
  const label = data.label;
  const grid = document.getElementById("grid");
  const total = document.getElementById("total");
  const viewer = document.getElementById("viewer");
  const viewerImg = document.getElementById("viewerImg");
  const viewerClose = document.getElementById("viewerClose");
  const viewerDownload = document.getElementById("viewerDownload");
  const base = `/${collection}/`;
  const cards = new Map();
  let lastFocus = null;
  let layout = null;
  let needsMeasure = true;
  let frame = 0;

  const assetUrl = (file) => base + encodeURIComponent(file);

  total.textContent = `${files.length} 张`;

  document.querySelectorAll("[data-count]").forEach((node) => {
    const item = window.ASSET_MANIFEST[node.dataset.count];
    node.textContent = item ? item.files.length : "";
  });

  function createCard(index) {
    const file = files[index];
    const url = assetUrl(file);
    const card = document.createElement("article");
    const thumb = document.createElement("button");
    const img = document.createElement("img");

    card.className = "card";
    card.style.gridColumn = `${(index % layout.columns) + 1}`;
    card.style.gridRow = `${Math.floor(index / layout.columns) + 1}`;
    thumb.className = "thumb";
    thumb.type = "button";
    thumb.setAttribute("aria-label", `预览${label}素材 ${file}`);
    img.src = url;
    img.alt = `奶蛙${label} ${file}`;
    img.loading = "lazy";
    img.decoding = "async";
    thumb.addEventListener("click", () => openPreview(file));

    thumb.append(img);
    card.append(thumb);
    return card;
  }

  function measure() {
    const styles = getComputedStyle(grid);
    const columns = Math.max(1, styles.gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    const columnGap = parseFloat(styles.columnGap) || 0;
    const rowGap = parseFloat(styles.rowGap) || 0;
    const width = grid.getBoundingClientRect().width;
    const cell = Math.max(1, (width - columnGap * (columns - 1)) / columns);
    const rows = Math.ceil(files.length / columns);

    grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
    layout = { columns, cell, rowGap, rows };
  }

  function clearCards() {
    cards.forEach((card) => card.remove());
    cards.clear();
  }

  function render() {
    frame = 0;

    if (!layout || needsMeasure) {
      clearCards();
      measure();
      needsMeasure = false;
    }

    const rect = grid.getBoundingClientRect();
    const step = layout.cell + layout.rowGap;
    let firstRow = 0;
    let lastRow = layout.rows - 1;

    if (rect.bottom < 0) {
      firstRow = Math.max(0, layout.rows - 1 - BUFFER_ROWS);
    } else if (rect.top > window.innerHeight) {
      lastRow = Math.min(layout.rows - 1, BUFFER_ROWS);
    } else {
      const top = Math.max(0, -rect.top);
      const bottom = Math.min(rect.height, window.innerHeight - rect.top);
      firstRow = Math.max(0, Math.floor(top / step) - BUFFER_ROWS);
      lastRow = Math.min(
        layout.rows - 1,
        Math.ceil(bottom / step) - 1 + BUFFER_ROWS,
      );
    }

    const start = firstRow * layout.columns;
    const end = Math.min(files.length - 1, (lastRow + 1) * layout.columns - 1);

    cards.forEach((card, index) => {
      if (index < start || index > end) {
        card.remove();
        cards.delete(index);
      }
    });

    for (let index = start; index <= end; index += 1) {
      if (!cards.has(index)) {
        const card = createCard(index);
        cards.set(index, card);
        grid.append(card);
      }
    }
  }

  function schedule(remeasure = false) {
    needsMeasure ||= remeasure;
    if (!frame) {
      frame = requestAnimationFrame(render);
    }
  }

  window.addEventListener("scroll", () => schedule(), { passive: true });
  window.addEventListener("resize", () => schedule(true));
  schedule(true);

  function openPreview(file) {
    lastFocus = document.activeElement;
    viewerImg.src = assetUrl(file);
    viewerImg.alt = `奶蛙${label} ${file}`;
    viewerDownload.href = assetUrl(file);
    viewerDownload.download = file;
    viewer.classList.add("is-open");
    viewer.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    document.querySelectorAll(".site-header, .site-container").forEach((node) => {
      node.inert = true;
    });
    viewerClose.focus();
  }

  function closePreview() {
    if (!viewer.classList.contains("is-open")) {
      return;
    }

    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    document.querySelectorAll(".site-header, .site-container").forEach((node) => {
      node.inert = false;
    });
    if (lastFocus && document.contains(lastFocus)) {
      lastFocus.focus();
    }
  }

  viewerClose.addEventListener("click", closePreview);
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) {
      closePreview();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreview();
    }
  });
})();
