import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ActionBar } from "@/components/person/ActionBar";
import { PersonCard } from "@/components/person/PersonCard";
import { pageMetadata } from "@/lib/metadata";
import { loadPerson, type PersonData } from "@/lib/person";
import { parsePersonParam, personPath, personSlug } from "@/lib/person-url";
import { fullName, metaDescription, narrative } from "@/lib/person-view";
import { shareText } from "@/lib/share-links";
import { absoluteUrl } from "@/lib/site-url";

/** One primary-key read per request. Not cached on purpose: 3.3M on-demand pages would grow the
 * route cache without bound on a 40 GB disk (decision of 2026-09-17). */
export const dynamic = "force-dynamic";

async function resolve(params: PageProps<"/person/[id]">["params"]): Promise<{ slug: string; data: PersonData }> {
  const { id } = await params;
  // Next leaves a dynamic segment percent-encoded as it arrived on the wire (no auto-decoding),
  // so a Cyrillic slug must be decoded before parsePersonParam sees it. A malformed escape is
  // just another invalid param.
  let decoded: string;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    notFound();
  }
  const parsed = parsePersonParam(decoded);
  if (!parsed) notFound();
  const data = await loadPerson(parsed.id);
  if (!data) notFound();
  return { slug: parsed.slug, data };
}

export async function generateMetadata({ params }: PageProps<"/person/[id]">): Promise<Metadata> {
  const { data } = await resolve(params);
  const name = fullName(data.person);
  return pageMetadata({
    title: data.person.birthYear === null ? name : `${name} (${data.person.birthYear})`,
    description: metaDescription(data.person, data.cases, data.labels),
    path: personPath(data.person.id, name),
    type: "profile",
  });
}

export default async function PersonPage({ params }: PageProps<"/person/[id]">) {
  const { slug, data } = await resolve(params);
  const name = fullName(data.person);
  const canonical = personPath(data.person.id, name);
  // `/person/<id>` and a stale slug (a renamed page) land on the canonical URL with a 308.
  // The Location header is Latin-1 only, so the Cyrillic slug must be percent-encoded here;
  // metadata's `alternates.canonical` below is resolved through `new URL()`, which already encodes it.
  if (slug !== personSlug(name)) permanentRedirect(encodeURI(canonical));
  const url = absoluteUrl(canonical);
  const text = narrative(data.person, data.cases, data.labels);
  const actions = <ActionBar shareUrl={url} shareText={shareText(name, text)} />;
  return <PersonCard data={data} canonicalUrl={url} actions={actions} />;
}
