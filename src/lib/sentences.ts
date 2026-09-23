/**
 * Sentence boundaries in the generated narrative, where place names are full of abbreviations
 * ("обл.", "г.", "р-н, п."). Dependency-free, so both the server-only share text and the person
 * view model can use it without pulling one another into a bundle.
 */

/** A sentence ends in a token of four letters or digits: "обл.", "г.", "ул." are abbreviations, not ends. */
const SENTENCE_TOKEN = /[\p{L}\d]{4,}\.$/u;
/** The next sentence opens with a capital: "Особ. тройка" is one sentence, not two. */
const SENTENCE_START = /^\p{Lu}/u;

/** True when the ". " at `dot` (the index of the full stop) closes a sentence. */
export function isSentenceEnd(text: string, dot: number): boolean {
  return SENTENCE_TOKEN.test(text.slice(0, dot + 1)) && SENTENCE_START.test(text.slice(dot + 2));
}

/** The first whole sentence, or null when the text has no boundary the rules above trust. */
export function firstSentence(text: string): string | null {
  for (let dot = text.indexOf(". "); dot > 0; dot = text.indexOf(". ", dot + 1)) {
    if (isSentenceEnd(text, dot)) return text.slice(0, dot + 1);
  }
  return null;
}
