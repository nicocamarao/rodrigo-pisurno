import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PUBLIC_SITE_URL, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TEXT_ROOTS = "header, aside, .stage, footer";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export function textNodes(doc = document) {
  const nodes = [];
  doc.querySelectorAll(TEXT_ROOTS).forEach((root) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() && !node.parentElement.closest("script,style")) nodes.push(node);
    }
  });
  return nodes;
}

export function applyContent(content, doc = document) {
  const nodes = textNodes(doc);
  (content.texts || []).forEach((value, index) => {
    if (nodes[index] && typeof value === "string") nodes[index].nodeValue = value;
  });
  const portrait = doc.querySelector(".profile figure img");
  if (portrait && content.profileImage) portrait.src = content.profileImage;
  if (Array.isArray(content.collections)) renderCollections(content.collections, doc);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slug(value) {
  return String(value || crypto.randomUUID()).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function projectFromCard(card, baseUrl) {
  const href = card.getAttribute("href") || "";
  const absoluteHref = new URL(href, baseUrl).href;
  let images = unique([...card.querySelectorAll("img")].map((img) => new URL(img.getAttribute("src"), baseUrl).href));
  let externalUrl = "";
  try {
    const response = await fetch(absoluteHref);
    if (response.ok) {
      const detail = new DOMParser().parseFromString(await response.text(), "text/html");
      const detailBase = new URL(".", absoluteHref);
      const detailImages = [...detail.querySelectorAll(".galeria img, .pieza img")]
        .map((img) => new URL(img.getAttribute("src"), detailBase).href);
      if (detailImages.length) images = unique(detailImages);
      externalUrl = detail.querySelector('.boton[href^="http"]')?.href || "";
    }
  } catch {
    // The cube images still provide a complete usable fallback.
  }
  const title = card.querySelector(".pie h3")?.textContent.trim() || "Proyecto";
  return {
    id: slug(href.split("/").pop()?.replace(/\.html$/, "") || title),
    title,
    subtitle: card.querySelector(".pie span")?.textContent.trim() || "",
    externalUrl,
    images
  };
}

export async function extractDefaultContent(indexUrl = "../index.html") {
  const response = await fetch(indexUrl);
  if (!response.ok) throw new Error("No se pudo leer el sitio actual.");
  const fetchedUrl = new URL(indexUrl, location.href);
  const baseUrl = ["localhost", "127.0.0.1"].includes(fetchedUrl.hostname)
    ? new URL("index.html", PUBLIC_SITE_URL) : fetchedUrl;
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  const collections = [];
  const children = [...doc.querySelector(".proyectos").children];
  for (let i = 0; i < children.length; i += 1) {
    if (children[i].tagName !== "H2") continue;
    const heading = children[i];
    const lead = children[i + 1]?.matches("p.lead") ? children[i + 1] : null;
    const grid = children.slice(i + 1).find((element) => element.matches(".grilla"));
    if (!grid) continue;
    const projects = await Promise.all([...grid.querySelectorAll(":scope > .card")]
      .map((card) => projectFromCard(card, baseUrl)));
    collections.push({
      id: heading.id || slug(heading.textContent),
      title: heading.textContent.trim(),
      description: lead?.textContent.trim() || "",
      projects
    });
  }
  return {
    texts: textNodes(doc).map((node) => node.nodeValue),
    profileImage: new URL(doc.querySelector(".profile figure img").getAttribute("src"), baseUrl).href,
    collections
  };
}

function cubeFaces(images, title) {
  const faces = ["frente", "derecha", "atras", "izquierda", "arriba", "abajo"];
  if (!images.length) return faces.map((face) =>
    `<span class="cara ${face} letra">${escapeHtml(title)}</span>`).join("");
  return faces.map((face, index) =>
    `<span class="cara ${face}"><img src="${escapeHtml(images[index % images.length])}" alt=""></span>`).join("");
}

export function renderCollections(collections, doc = document) {
  const section = doc.querySelector(".proyectos");
  if (!section) return;
  section.innerHTML = `<p class="eyebrow">PIEZAS</p>${collections.map((collection) => `
    <h2 id="${escapeHtml(collection.id)}">${escapeHtml(collection.title)}</h2>
    <p class="lead">${escapeHtml(collection.description)}</p>
    <div class="grilla">${(collection.projects || []).map((project) => `
      <a class="card" href="proyectos/ver.html?id=${encodeURIComponent(project.id)}">
        <div class="escena" aria-hidden="true"><div class="cubo">${cubeFaces(project.images || [], project.title)}</div></div>
        <div class="pie"><h3>${escapeHtml(project.title)}</h3><span>${escapeHtml(project.subtitle)}</span></div>
      </a>`).join("")}
    </div>`).join("")}`;
  doc.dispatchEvent(new CustomEvent("cms:collections-rendered"));
}

export async function loadContent() {
  const { data, error } = await supabase.from("portfolio_content").select("content").eq("id", "main").maybeSingle();
  if (error) throw error;
  return data?.content || null;
}

export function findProject(content, id) {
  for (const collection of content?.collections || []) {
    const project = (collection.projects || []).find((item) => item.id === id);
    if (project) return { project, collection };
  }
  return null;
}
