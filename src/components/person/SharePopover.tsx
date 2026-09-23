"use client";

import { Button, CopyButton, Popover, Tooltip } from "@mantine/core";
import { IconBrandFacebook, IconBrandOkRu, IconBrandTelegram, IconBrandVk, IconBrandWhatsapp, IconBrandX, IconCheck, IconCopy, IconMail, IconShare, IconShare3 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { shareLinks, type ShareLink } from "@/lib/share-links";
import { UI } from "@/lib/ui-text";
import styles from "./person.module.css";

const ICONS: Record<ShareLink["key"], typeof IconBrandTelegram> = {
  telegram: IconBrandTelegram, whatsapp: IconBrandWhatsapp, vk: IconBrandVk, ok: IconBrandOkRu, x: IconBrandX, facebook: IconBrandFacebook, email: IconMail,
};

export function SharePopover({ url, text }: { url: string; text: string }) {
  const S = UI.person.share;
  const [opened, setOpened] = useState(false);
  // Web Share exists only in the browser; decided after mount so the server and first client render agree.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection is browser-only
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  const links = shareLinks(url, text);
  return (
    <Popover opened={opened} onChange={setOpened} width={300} position="bottom-end" shadow="md" trapFocus returnFocus>
      <Popover.Target>
        <Button variant="default" size="sm" leftSection={<IconShare size={16} stroke={1.6} />} onClick={() => setOpened((o) => !o)} aria-expanded={opened} data-testid="action-share">
          {S.title}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        {canShare && (
          <Button fullWidth variant="light" size="sm" leftSection={<IconShare3 size={16} stroke={1.6} />} className={styles.shareSystem} onClick={() => void navigator.share({ url, text, title: text }).catch(() => undefined)}>
            {S.system}
          </Button>
        )}
        <div className={styles.shareGrid}>
          {links.map((link) => {
            const Icon = ICONS[link.key];
            return (
              <Tooltip key={link.key} label={link.label}>
                <a href={link.href} target={link.key === "email" ? undefined : "_blank"} rel="noopener noreferrer" className={styles.shareLink} aria-label={link.label}>
                  <Icon size={22} stroke={1.6} />
                </a>
              </Tooltip>
            );
          })}
        </div>
        <CopyButton value={url} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? S.copied : S.copy}>
              <Button fullWidth variant="subtle" size="sm" leftSection={copied ? <IconCheck size={16} stroke={1.6} /> : <IconCopy size={16} stroke={1.6} />} onClick={copy} data-testid="share-copy">
                {copied ? S.copied : S.copy}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      </Popover.Dropdown>
    </Popover>
  );
}
