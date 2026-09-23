"use client";

import { Button, Input, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useRef, useState, type FormEvent } from "react";
import { UI } from "@/lib/ui-text";
import styles from "./SearchBox.module.css";

export interface SearchBoxProps {
  /** Prefilled query. To re-seed it when the query changes elsewhere (a URL navigation, a reset
      button, …), remount the component with a new `key` (e.g. `key={query}`) — SearchView does this. */
  defaultValue?: string;
  autoFocus?: boolean;
  /** When given, submit is intercepted (no navigation) and the field's value at that moment is passed
      here instead — used by pages that run their own search. Also called with `""` from the clear
      button, so a live-search page drops its query exactly as an empty submit would. Left out, the
      form is a plain GET to `/search` and this component behaves exactly as a bare search box. */
  onSubmit?: (value: string) => void;
}

/**
 * The site's one search field (home page, `/search`, the 404 page): a plain GET form to `/search`
 * that works before hydration and without JavaScript. `onSubmit` turns submission into a client-side
 * search instead of a navigation; without it, the browser handles the GET itself.
 */
export function SearchBox({ defaultValue, autoFocus, onSubmit }: SearchBoxProps) {
  const input = useRef<HTMLInputElement>(null);
  // Tracks what is actually typed, not just the committed query, so the clear button follows
  // keystrokes rather than only appearing after a submit.
  const [hasValue, setHasValue] = useState(Boolean(defaultValue));

  function clear() {
    const field = input.current;
    if (field) {
      field.value = "";
      field.focus();
    }
    setHasValue(false);
    onSubmit?.("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!onSubmit) return;
    event.preventDefault();
    onSubmit(input.current?.value ?? "");
  }

  return (
    <form className={styles.search} action="/search" method="get" role="search" onSubmit={handleSubmit}>
      <div className={styles.searchRow}>
        {/* `variant="unstyled"` drops the input's own border/background so `.searchRow` is the only
            thing drawing one — see the comment there. */}
        <TextInput
          ref={input}
          name="q"
          type="search"
          size="lg"
          radius="md"
          variant="unstyled"
          aria-label={UI.search.title}
          placeholder={UI.search.placeholder}
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          onChange={(event) => setHasValue(event.currentTarget.value !== "")}
          leftSection={<IconSearch size={20} stroke={1.6} />}
          rightSection={
            hasValue ? (
              <Input.ClearButton
                type="button"
                aria-label={UI.search.clear}
                onClick={clear}
                className={styles.clearButton}
              />
            ) : null
          }
          rightSectionPointerEvents="all"
          className={styles.searchInput}
        />
        {/* The ink button of the design: `color="dark"` resolved to Mantine's grey scale, which reads
            as muddy grey in the dark scheme. The class paints it from the site's own tokens instead. */}
        <Button type="submit" size="lg" radius="md" variant="filled" className={styles.searchSubmit}>
          {UI.search.submit}
        </Button>
      </div>
    </form>
  );
}
