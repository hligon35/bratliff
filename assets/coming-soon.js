(function () {
  "use strict";

  const entrance = document.querySelector("[data-site-entrance]");
  if (!entrance) return;

  let clicks = 0;
  entrance.addEventListener("click", function () {
    clicks += 1;
    if (clicks !== 5) return;
    entrance.disabled = true;
    window.location.assign("/?site-preview=1");
  });
})();
