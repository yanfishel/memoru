import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { UI } from "@/lib/ui-text";

export default function NotFound() {
  return (
    <>
      <h1>{UI.notFound.title}</h1>
      <p>{UI.notFound.hint}</p>
      <SearchBox />
      <p><Link href="/">{UI.notFound.home}</Link></p>
    </>
  );
}
