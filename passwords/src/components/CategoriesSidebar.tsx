import { NavLink, Stack, Text } from "@mantine/core";
import { Globe, CreditCard, StickyNote, User, KeyRound } from "lucide-react";
import type { ReactNode } from "react";

export type Category = "all" | "login" | "card" | "note" | "identity";

const CATEGORIES: { value: Category; label: string; icon: ReactNode }[] = [
  { value: "all", label: "All", icon: <KeyRound size={16} /> },
  { value: "login", label: "Logins", icon: <Globe size={16} /> },
  { value: "card", label: "Cards", icon: <CreditCard size={16} /> },
  { value: "note", label: "Secure Notes", icon: <StickyNote size={16} /> },
  { value: "identity", label: "Identities", icon: <User size={16} /> },
];

interface CategoriesSidebarProps {
  selected: Category;
  onSelect: (category: Category) => void;
  counts: Record<Category, number>;
}

export function CategoriesSidebar({ selected, onSelect, counts }: CategoriesSidebarProps) {
  return (
    <Stack gap="xs" h="100%">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs">
        Categories
      </Text>

      <Stack gap={2}>
        {CATEGORIES.map((cat) => (
          <NavLink
            key={cat.value}
            active={selected === cat.value}
            onClick={() => onSelect(cat.value)}
            label={cat.label}
            leftSection={cat.icon}
            rightSection={
              counts[cat.value] > 0 ? (
                <Text size="xs" c="dimmed">
                  {counts[cat.value]}
                </Text>
              ) : undefined
            }
          />
        ))}
      </Stack>
    </Stack>
  );
}
