// "Examples without a camera": AI-generated photos with the landmarks MediaPipe found in them
// (scripts/detect_examples.py writes examples.json), scored live by the same rules.
import detected from "./examples.json";
import { cases } from "./cases";
import { setFigure } from "./figure";
import { checkRows, checksTableMarkup, renderChecks, renderScore, scoreMarkup } from "./readout";
import type { FacePoints, PosePoints } from "./rules";
import { evaluate } from "./rules";

type Detection = { w: number; h: number; pose: PosePoints | null; face: FacePoints | null };
type Person = "male" | "female";

const PEOPLE: { id: Person; label: string; noun: string }[] = [
  { id: "male", label: "Man", noun: "man" },
  { id: "female", label: "Woman", noun: "woman" },
];

const data = detected as unknown as Record<Person, Record<string, Detection>>;
const scenarios = cases.filter((c) => c.demo);

export const photoUrl = (person: Person, id: string) => `/examples/${person}/${id}.jpg`;

export function drawDetection(svg: SVGSVGElement, d: Detection) {
  const result = evaluate(d.pose, d.face, d.w, d.h);
  setFigure(svg, { pose: d.pose, face: d.face, aspect: d.h / d.w, issues: result.issues });
  return result;
}

export function heroDetection() {
  return data.male.focused;
}

// Arrow keys move between radio buttons, as a radio group should.
function radioKeys(root: HTMLElement, select: (btn: HTMLButtonElement) => void) {
  root.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(i + step + buttons.length) % buttons.length];
    select(next);
    next.focus();
  });
}

function markChecked(root: HTMLElement, attr: string, value: string) {
  root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    const on = b.dataset[attr] === value;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

export function initExamples() {
  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const peopleRoot = $("#people");
  const scenarioRoot = $("#scenarios");
  const img = $<HTMLImageElement>("#example-img");
  const svg = $<SVGSVGElement>("#example-svg");
  const scoreRoot = $("#example-score");
  scoreRoot.innerHTML = scoreMarkup;
  $("#example-checks").innerHTML = checksTableMarkup("example-tbody");

  let person: Person = "male";
  let scenario = "drowsy_slump";

  function render() {
    const d = data[person][scenario];
    const meta = scenarios.find((s) => s.id === scenario)!.demo!;
    const noun = PEOPLE.find((p) => p.id === person)!.noun;
    img.src = photoUrl(person, scenario);
    img.alt = scenario === "no_face" ? "An empty desk with nobody in front of the camera" : `${meta.label}: an AI-generated ${noun} at a desk`;
    const result = drawDetection(svg, d);
    $("#example-desc").textContent = meta.description;
    renderScore(scoreRoot, result);
    renderChecks($("#example-tbody"), checkRows(d.pose, d.face, d.w, d.h), result);
    markChecked(peopleRoot, "person", person);
    markChecked(scenarioRoot, "id", scenario);
  }

  function renderScenarioButtons() {
    scenarioRoot.innerHTML = scenarios
      .filter((s) => data[person][s.id])
      .map((s) => `<button type="button" role="radio" data-id="${s.id}">${s.demo!.label}</button>`)
      .join("");
    if (!data[person][scenario]) scenario = "focused";
  }

  peopleRoot.innerHTML = PEOPLE.map((p) => `<button type="button" role="radio" data-person="${p.id}">${p.label}</button>`).join("");

  const pickPerson = (btn: HTMLButtonElement) => {
    person = btn.dataset.person as Person;
    renderScenarioButtons();
    render();
  };
  const pickScenario = (btn: HTMLButtonElement) => {
    scenario = btn.dataset.id!;
    render();
  };
  peopleRoot.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-person]");
    if (btn) pickPerson(btn);
  });
  scenarioRoot.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
    if (btn) pickScenario(btn);
  });
  radioKeys(peopleRoot, pickPerson);
  radioKeys(scenarioRoot, pickScenario);

  renderScenarioButtons();
  render();
}
