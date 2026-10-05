initAdminIcons();

if (window.MutationObserver) {
  const iconTarget = qs(".page-content") || qs("main");
  let iconFrame = 0;
  if (iconTarget) {
    new MutationObserver(function () {
      if (iconFrame) return;
      iconFrame = window.requestAnimationFrame(function () {
        iconFrame = 0;
        initAdminIcons();
      });
    }).observe(iconTarget, { childList: true, subtree: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", refreshCurrentPage);
} else {
  refreshCurrentPage();
}