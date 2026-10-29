import { applyContent, loadContent } from "./cms-core.js";

try {
  const content = await loadContent();
  if (content) applyContent(content);
} catch (error) {
  console.warn("El contenido guardado no está disponible; se muestra la versión publicada.", error);
}
