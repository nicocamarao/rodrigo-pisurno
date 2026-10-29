import { ADMIN_FUNCTION, SUPABASE_KEY } from "./config.js";
import { extractDefaultContent, loadContent, supabase } from "./cms-core.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const sessionKey = "rodrigo-portfolio-admin-session";
let token = sessionStorage.getItem(sessionKey) || "";
let content;

async function adminRequest(action, payload = {}) {
  const response = await fetch(ADMIN_FUNCTION, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ action, token, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}

function showEditor() {
  $("#login-panel").hidden = true;
  $("#editor").hidden = false;
  $("#logout").hidden = false;
}

function setMessage(selector, message, error = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function openEditor() {
  showEditor();
  setMessage("#save-message", "Cargando contenido…");
  try {
    content = await loadContent() || await extractDefaultContent("../index.html");
    render();
    setMessage("#save-message", "");
  } catch (error) {
    setMessage("#save-message", error.message, true);
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  setMessage("#login-message", "Comprobando acceso…");
  const data = new FormData(event.currentTarget);
  try {
    const result = await adminRequest("login", {
      username: data.get("username"),
      password: data.get("password")
    });
    token = result.token;
    sessionStorage.setItem(sessionKey, token);
    await openEditor();
  } catch (error) {
    setMessage("#login-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", () => {
  token = "";
  sessionStorage.removeItem(sessionKey);
  location.reload();
});

function render() {
  $("#profile-image").innerHTML = `
    <div class="image-editor">
      <img src="${escapeHtml(content.profileImage)}" alt="Imagen actual del perfil">
      <div><label>Imagen principal<input id="profile-upload" type="file" accept="image/*"></label>
      <small>Se sube al seleccionarla; el cambio se publica al guardar.</small></div>
    </div>`;
  $("#text-fields").innerHTML = (content.texts || []).map((value, index) => `
    <label><span class="field-context">${escapeHtml(String(value).trim().slice(0, 90))}</span>
      <textarea data-text="${index}">${escapeHtml(value)}</textarea>
    </label>`).join("");
  $("#collections").innerHTML = (content.collections || []).map(collectionTemplate).join("");
}

function collectionTemplate(collection, collectionIndex) {
  return `<article class="collection" data-collection="${collectionIndex}">
    <div class="collection-head"><h3>Sección ${collectionIndex + 1}</h3>
      <button class="secondary danger remove-collection" type="button">Eliminar sección</button></div>
    <div class="collection-fields">
      <label>Nombre<input data-field="title" value="${escapeHtml(collection.title)}"></label>
      <label>Descripción<textarea data-field="description">${escapeHtml(collection.description)}</textarea></label>
    </div>
    <div class="projects">${(collection.projects || []).map((project, projectIndex) =>
      projectTemplate(project, projectIndex)).join("")}</div>
    <button class="secondary add-project" type="button">+ Agregar proyecto</button>
  </article>`;
}

function projectTemplate(project, projectIndex) {
  return `<article class="project" data-project="${projectIndex}">
    <div class="project-head"><h3>${escapeHtml(project.title || "Proyecto nuevo")}</h3>
      <button class="secondary danger remove-project" type="button">Eliminar</button></div>
    <div class="project-fields">
      <label>Título<input data-field="title" value="${escapeHtml(project.title)}"></label>
      <label>Texto breve<input data-field="subtitle" value="${escapeHtml(project.subtitle)}"></label>
      <label class="wide">Enlace externo (opcional)<input data-field="externalUrl" type="url" value="${escapeHtml(project.externalUrl)}"></label>
    </div>
    <div class="images">${(project.images || []).map((url, imageIndex) => `
      <div class="image-row"><img src="${escapeHtml(url)}" alt=""><button class="remove-image" data-image="${imageIndex}" type="button" aria-label="Quitar imagen">×</button></div>`).join("")}</div>
    <label class="upload">+ Subir fotos desde el dispositivo<input class="project-upload" type="file" accept="image/*" multiple></label>
    <div class="url-upload"><input class="image-url" type="url" placeholder="https://sitio.com/imagen.jpg" aria-label="URL de imagen">
      <button class="secondary import-image" type="button">Copiar imagen desde URL</button></div>
  </article>`;
}

function syncForm() {
  document.querySelectorAll("[data-text]").forEach((field) => {
    content.texts[Number(field.dataset.text)] = field.value;
  });
  document.querySelectorAll("[data-collection]").forEach((collectionElement) => {
    const collection = content.collections[Number(collectionElement.dataset.collection)];
    collectionElement.querySelectorAll(":scope > .collection-fields [data-field]").forEach((field) => {
      collection[field.dataset.field] = field.value;
    });
    collectionElement.querySelectorAll("[data-project]").forEach((projectElement) => {
      const project = collection.projects[Number(projectElement.dataset.project)];
      projectElement.querySelectorAll("[data-field]").forEach((field) => {
        project[field.dataset.field] = field.value;
      });
    });
  });
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
}

$("#add-collection").addEventListener("click", () => {
  syncForm();
  content.collections.push({ id: newId("seccion"), title: "Nueva sección", description: "", projects: [] });
  render();
  $("#collections .collection:last-child").scrollIntoView({ behavior: "smooth" });
});

$("#collections").addEventListener("click", (event) => {
  const collectionElement = event.target.closest("[data-collection]");
  if (!collectionElement) return;
  const collectionIndex = Number(collectionElement.dataset.collection);
  if (event.target.closest(".remove-collection")) {
    if (!confirm("¿Eliminar esta sección y todos sus proyectos?")) return;
    syncForm();
    content.collections.splice(collectionIndex, 1);
    render();
  } else if (event.target.closest(".add-project")) {
    syncForm();
    content.collections[collectionIndex].projects.push({
      id: newId("proyecto"), title: "Proyecto nuevo", subtitle: "", externalUrl: "", images: []
    });
    render();
  } else if (event.target.closest(".remove-project")) {
    const projectIndex = Number(event.target.closest("[data-project]").dataset.project);
    if (!confirm("¿Eliminar este proyecto?")) return;
    syncForm();
    content.collections[collectionIndex].projects.splice(projectIndex, 1);
    render();
  } else if (event.target.closest(".remove-image")) {
    const projectIndex = Number(event.target.closest("[data-project]").dataset.project);
    const imageIndex = Number(event.target.closest(".remove-image").dataset.image);
    syncForm();
    const [removedUrl] = content.collections[collectionIndex].projects[projectIndex].images.splice(imageIndex, 1);
    adminRequest("delete_image", { url: removedUrl }).catch((error) =>
      setMessage("#save-message", `La imagen se quitó del proyecto, pero no del almacenamiento: ${error.message}`, true));
    render();
  } else if (event.target.closest(".import-image")) {
    const projectElement = event.target.closest("[data-project]");
    const projectIndex = Number(projectElement.dataset.project);
    const url = projectElement.querySelector(".image-url").value.trim();
    if (!url) return;
    syncForm();
    event.target.disabled = true;
    setMessage("#save-message", "Copiando imagen externa a Supabase…");
    adminRequest("import_image", { url }).then((result) => {
      content.collections[collectionIndex].projects[projectIndex].images.push(result.publicUrl);
      render();
      setMessage("#save-message", "Imagen copiada. Falta guardar para publicarla.");
    }).catch((error) => {
      event.target.disabled = false;
      setMessage("#save-message", error.message, true);
    });
  }
});

async function uploadImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} no es una imagen.`);
  const signed = await adminRequest("create_upload", { filename: file.name, contentType: file.type });
  const { error } = await supabase.storage.from("portfolio-media")
    .uploadToSignedUrl(signed.path, signed.uploadToken, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("portfolio-media").getPublicUrl(signed.path).data.publicUrl;
}

$("#profile-image").addEventListener("change", async (event) => {
  if (event.target.id !== "profile-upload" || !event.target.files[0]) return;
  setMessage("#save-message", "Subiendo imagen principal…");
  try {
    content.profileImage = await uploadImage(event.target.files[0]);
    render();
    setMessage("#save-message", "Imagen lista. Falta guardar para publicarla.");
  } catch (error) {
    setMessage("#save-message", error.message, true);
  }
});

$("#collections").addEventListener("change", async (event) => {
  if (!event.target.matches(".project-upload") || !event.target.files.length) return;
  syncForm();
  const collectionIndex = Number(event.target.closest("[data-collection]").dataset.collection);
  const projectIndex = Number(event.target.closest("[data-project]").dataset.project);
  event.target.disabled = true;
  setMessage("#save-message", `Subiendo ${event.target.files.length} imagen(es)…`);
  try {
    const urls = [];
    for (const file of event.target.files) urls.push(await uploadImage(file));
    content.collections[collectionIndex].projects[projectIndex].images.push(...urls);
    render();
    setMessage("#save-message", "Imágenes listas. Falta guardar para publicarlas.");
  } catch (error) {
    setMessage("#save-message", error.message, true);
  }
});

$("#editor").addEventListener("submit", async (event) => {
  event.preventDefault();
  syncForm();
  const button = $("#save");
  button.disabled = true;
  setMessage("#save-message", "Guardando…");
  try {
    await adminRequest("save", { content });
    setMessage("#save-message", "Guardado y publicado.");
  } catch (error) {
    setMessage("#save-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

if (token) openEditor();
