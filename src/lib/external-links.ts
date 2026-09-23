// The project's public addresses in one place: the footer icons point at them and a repo move or a
// new contact address must not leave one behind (spec §3.5).

/** No remote exists yet; the maintainer confirms or edits this before the first deploy. */
export const GITHUB_REPO_URL = "https://github.com/yanfishel/memoru";
export const CONTACT_EMAIL = "yan.fishel@gmail.com";
export const FISHART_URL = "https://fishart.co.il";

/** A `mailto:` with the subject pre-filled, so replies arrive sorted. */
export function mailtoHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
