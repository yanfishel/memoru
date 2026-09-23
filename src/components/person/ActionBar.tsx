"use client";

import { Button } from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { UI } from "@/lib/ui-text";
import { SharePopover } from "./SharePopover";

export function ActionBar({ shareUrl, shareText }: { shareUrl: string; shareText: string }) {
  const A = UI.person.actions;
  return (
    <>
      <Button variant="default" size="sm" leftSection={<IconPrinter size={16} stroke={1.6} />} onClick={() => window.print()} data-testid="action-print">
        {A.print}
      </Button>
      <SharePopover url={shareUrl} text={shareText} />
    </>
  );
}
