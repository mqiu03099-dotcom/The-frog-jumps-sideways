const copyButtons = document.querySelectorAll("[data-copy-link]");
const copyNameButton = document.getElementById("copy-name-button");
const copyToast = document.getElementById("copy-toast");
const gameName = window.GAME_INFO.name;
let toastTimer;

const showToast = (message, type = "success") => {
  clearTimeout(toastTimer);
  copyToast.textContent = message;
  copyToast.classList.toggle("copy-toast--error", type === "error");
  copyToast.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    copyToast.classList.remove("is-visible");
  }, 1800);
};

const copyGameName = async () => {
  copyButtons.forEach((button) => {
    button.disabled = true;
  });
  copyNameButton.disabled = true;

  try {
    await navigator.clipboard.writeText(gameName);
    showToast("名称已复制，打开微信搜索开玩");
  } catch (error) {
    showToast("复制失败，请在微信搜索「奶蛙跳跳跳」", "error");
  } finally {
    copyButtons.forEach((button) => {
      button.disabled = false;
    });
    copyNameButton.disabled = false;
  }
};

copyButtons.forEach((button) => {
  button.addEventListener("click", copyGameName);
});

copyNameButton.addEventListener("click", copyGameName);
