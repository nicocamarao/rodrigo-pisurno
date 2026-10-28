(() => {
  const poses = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".cubo").forEach((cubo, indice) => {
    let paso = indice % poses.length;
    const pintar = () => {
      const [x, y] = poses[paso];
      cubo.style.setProperty("--rx", x + "deg");
      cubo.style.setProperty("--ry", y + "deg");
    };
    pintar();
    if (reducido) return;
    let reloj = 0;
    const seguir = () => {
      if (reloj) return;
      reloj = window.setInterval(() => {
        paso = (paso + 1) % poses.length;
        pintar();
      }, 2800);
    };
    const pausar = () => {
      window.clearInterval(reloj);
      reloj = 0;
    };
    const tarjeta = cubo.closest(".card");
    window.setTimeout(seguir, indice * 160);
    tarjeta.addEventListener("mouseenter", pausar);
    tarjeta.addEventListener("mouseleave", seguir);
    tarjeta.addEventListener("focusin", pausar);
    tarjeta.addEventListener("focusout", seguir);
  });
})();
