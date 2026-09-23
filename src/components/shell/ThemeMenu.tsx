"use client";

import { ActionIcon, Menu, Tooltip, useMantineColorScheme, type MantineColorScheme } from "@mantine/core";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-text";

const OPTIONS: Array<{ value: MantineColorScheme; label: string; Icon: typeof IconSun }> = [
  { value: "light", label: UI.theme.light, Icon: IconSun },
  { value: "dark", label: UI.theme.dark, Icon: IconMoon },
  { value: "auto", label: UI.theme.auto, Icon: IconDeviceDesktop },
];

export function ThemeMenu() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  // The stored choice is only known in the browser; until mounted the button shows the "auto" icon
  // so the server and the first client render agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Runs once, only to flip a flag that could not be true during SSR — not state derived from
    // anything reactive, so there is no dependency to gate it on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const current = (mounted && OPTIONS.find((o) => o.value === colorScheme)) || OPTIONS[2];

  return (
    <Menu shadow="md" width={190} position="bottom-end">
      <Menu.Target>
        <Tooltip label={UI.theme.title}>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={UI.theme.title} data-testid="theme-menu">
            <current.Icon size={20} stroke={1.6} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {OPTIONS.map((o) => (
          <Menu.Item
            key={o.value}
            leftSection={<o.Icon size={16} stroke={1.6} />}
            onClick={() => setColorScheme(o.value)}
            aria-current={mounted && o.value === colorScheme ? "true" : undefined}
            fw={mounted && o.value === colorScheme ? 600 : undefined}
          >
            {o.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
