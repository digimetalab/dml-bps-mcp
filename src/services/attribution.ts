import { ATTRIBUTION, ATTRIBUTION_EN } from "../config/defaults.js";

function getAttribution(lang: "ind" | "eng" = "eng"): string {
  return lang === "eng" ? ATTRIBUTION_EN : ATTRIBUTION;
}

export function appendAttribution(text: string, lang: "ind" | "eng" = "eng"): string {
  return `${text}\n\n---\n${getAttribution(lang)}`;
}
