// Privacy policy and disclaimer pages: shared styles plus an "On this page" list
// built from the article's section headings.
import "./style.css";

const article = document.querySelector<HTMLElement>(".legal article");
const headings = article ? [...article.querySelectorAll<HTMLHeadingElement>(":scope > h2[id]")] : [];

if (article && headings.length) {
  const nav = document.createElement("nav");
  nav.className = "legal-toc";
  nav.setAttribute("aria-label", "On this page");
  nav.innerHTML =
    `<p class="legal-toc-title">On this page</p><ol>` +
    headings.map((h) => `<li><a href="#${h.id}">${h.textContent}</a></li>`).join("") +
    `</ol>`;
  article.before(nav);
}
