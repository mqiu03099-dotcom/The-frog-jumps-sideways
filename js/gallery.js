(() => {
  const collection = document.body.dataset.collection;
  const data = window.ASSET_MANIFEST?.[collection];

  if (!data) {
    return;
  }

  const BATCH_SIZE = 24;
  const files = data.files;
  const label = data.label;
  const grid = document.getElementById("grid");
  const sentinel = document.getElementById("sentinel");
  const total = document.getElementById("total");
  const viewer = document.getElementById("viewer");
  const viewerImg = document.getElementById("viewerImg");
  const viewerClose = document.getElementById("viewerClose");
  const viewerDownload = document.getElementById("viewerDownload");
  const base = `/${collection}/`;
  let cursor = 0;
  let done = false;
  let lastFocus = null;

  const assetUrl = (file) => base + encodeURIComponent(file);

  total.textContent = `${files.length} 张`;

  document.querySelectorAll("[data-count]").forEach((node) => {
    const item = window.ASSET_MANIFEST[node.dataset.count];
    node.textContent = item ? item.files.length : "";
  });

  function createCard(file) {
    const url = assetUrl(file);
    const card = document.createElement("article");
    const thumb = document.createElement("button");
    const img = document.createElement("img");

    card.className = "card";
    thumb.className = "thumb";
    thumb.type = "button";
    thumb.setAttribute("aria-label", `预览${label}素材 ${file}`);
    img.src = url;
    img.alt = `${label}素材 ${file}`;
    img.loading = "lazy";
    img.decoding = "async";
    thumb.addEventListener("click", () => openPreview(file));

    thumb.append(img);
    card.append(thumb);
    return card;
  }

  function fillBatch() {
    if (done) {
      return;
    }

    const batch = files.slice(cursor, cursor + BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    batch.forEach((file) => fragment.append(createCard(file)));
    grid.append(fragment);
    cursor += batch.length;

    if (cursor >= files.length) {
      done = true;
      observer.disconnect();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        fillBatch();
      }
    },
    { rootMargin: "500px 0px" },
  );

  fillBatch();
  if (!done) {
    observer.observe(sentinel);
  }

  function openPreview(file) {
    lastFocus = document.activeElement;
    viewerImg.src = assetUrl(file);
    viewerImg.alt = `${label}素材 ${file}`;
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
