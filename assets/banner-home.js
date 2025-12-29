document.addEventListener("DOMContentLoaded", () => {
  const timers = document.querySelectorAll(".banner-home-timer");

  if (!timers || timers.length === 0) return;

  timers.forEach((el) => {
    const endDateStr = el.getAttribute("data-end-date");
    if (!endDateStr) return;

    const endDate = new Date(endDateStr);
    if (Number.isNaN(endDate.getTime())) {
      el.textContent = "Fecha inválida";
      return;
    }

    let intervalId = null;

    function renderRemaining(diff) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      el.innerHTML = `
        <span class="timer-days">${days}d</span>
        <span class="timer-hours">${hours}h</span>
        <span class="timer-minutes">${minutes}m</span>
        <span class="timer-seconds">${seconds}s</span>
      `;
    }

    function finish() {
      if (intervalId) clearInterval(intervalId);
      el.style.opacity = "0";
      setTimeout(() => {
        el.innerHTML = "Tiempo finalizado";
        el.classList.add("countdown-finished");
        el.style.opacity = "1";
      }, 600);
    }

    function tick() {
      const now = Date.now();
      const diff = endDate.getTime() - now;
      if (diff <= 0) {
        finish();
        return;
      }
      renderRemaining(diff);
    }

    // Initial render then start interval
    tick();
    intervalId = setInterval(tick, 1000);
  });
});
