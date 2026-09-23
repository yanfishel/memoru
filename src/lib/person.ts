import "server-only";

import { cache } from "react";
import { getBuildInfo, getCases, getLabels, getPerson, type LabelMap } from "@/db/queries";
import { getActiveServing } from "@/db/serving";
import type { CaseRecord, PersonRecord } from "@/db/schema";
import { findSimilar, type SimilarPerson } from "./search";

export interface PersonData {
  person: PersonRecord;
  cases: CaseRecord[];
  labels: LabelMap;
  dataDate: string | null;
  similar: SimilarPerson[];
}

/** One record with its cases and the labels to read it with. React's `cache` dedupes the call
 * between `generateMetadata` and the page body within one request. */
export const loadPerson = cache(async (id: number): Promise<PersonData | null> => {
  const serving = await getActiveServing();
  const person = await getPerson(serving, id);
  if (!person) return null;
  const [cases, labels, info, similar] = await Promise.all([
    getCases(serving, id),
    getLabels(serving),
    getBuildInfo(serving),
    findSimilar(person),
  ]);
  return { person, cases, labels, dataDate: info?.dataDate ?? null, similar };
});
