/** Splits "**bold**" segments so money values can be styled or made interactive. */
export function segments(answer: string) {
  return answer
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((s) => (s.startsWith("**") ? { bold: true, text: s.slice(2, -2) } : { bold: false, text: s }));
}
