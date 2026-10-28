(() => {
  const ids = ["perfil", "experiencia", "formacion", "aptitudes", "trabajos", "recomendaciones"];
  const names = ["PERFIL", "EXPERIENCIA", "FORMACIÓN", "APTITUDES", "TRABAJOS", "RECOMENDACIONES"];
  const poses = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];
  const adjacent = { left: [3, 0, 1, 2, 3, 3], right: [1, 2, 3, 0, 1, 1], up: [4, 4, 4, 4, 2, 0], down: [5, 5, 5, 5, 0, 2] };
  const cube = document.querySelector(".cube");
  const faces = [...cube.querySelectorAll(":scope > .face")];
  const links = [...document.querySelectorAll("aside nav a")];
  let current = Math.max(0, ids.indexOf(location.hash.slice(1)));
  let continuous = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function render() {
    const [x, y] = poses[current];
    cube.style.transform = `translateZ(calc(-1 * var(--depth))) rotateX(${x}deg) rotateY(${y}deg)`;
    faces.forEach((face, i) => {
      face.inert = !continuous && i !== current;
      face.setAttribute("aria-hidden", String(!continuous && i !== current));
    });
    links.forEach((a, i) => a.setAttribute("aria-current", String(i === current)));
    document.querySelector("#position").textContent = `0${current + 1} / 06`;
    document.querySelector("#view-label").textContent = names[current];
    if (ids.includes(location.hash.slice(1)) || location.hash === "") {
      history.replaceState(null, "", "#" + ids[current]);
    }
  }
  function navigate(index) {
    current = index;
    render();
    if (continuous) faces[index].scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth" });
  }
  function turn(direction) {
    if (!continuous) navigate(adjacent[direction][current]);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const index = ids.indexOf(a.hash.slice(1));
    if (index !== -1) {
      e.preventDefault();
      navigate(index);
    }
  }));
  document.querySelectorAll("[data-direction]").forEach((button) => button.addEventListener("click", () => turn(button.dataset.direction)));
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input,textarea,select")) return;
    const direction = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
    if (direction && !continuous) {
      e.preventDefault();
      turn(direction);
    }
  });
  const motion = document.querySelector("#motion");
  function toggleMotion() {
    const paused = document.body.classList.toggle("paused");
    motion.setAttribute("aria-pressed", String(paused));
    motion.textContent = paused ? "Activar líneas" : "Pausar líneas";
  }
  motion.onclick = toggleMotion;
  if (reduced.matches) toggleMotion();
  document.querySelector("#flat").onclick = function () {
    continuous = !continuous;
    document.body.classList.toggle("continuous", continuous);
    this.setAttribute("aria-pressed", String(continuous));
    this.textContent = continuous ? "Volver al cubo" : "Vista continua";
    render();
    if (!continuous) document.querySelector(".stage").scrollIntoView({ behavior: "instant", block: "start" });
  };
  window.addEventListener("hashchange", () => {
    const index = ids.indexOf(location.hash.slice(1));
    if (index !== -1) navigate(index);
  });
  render();
})();
