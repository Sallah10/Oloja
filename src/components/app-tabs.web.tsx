import { TabList, TabSlot, Tabs, TabTrigger, TabTriggerSlotProps } from "expo-router/ui";
import type { Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

const TABS: { name: string; label: string; href: Href }[] = [
  { name: "index", label: "Home", href: "/" },
  { name: "sales", label: "Sales", href: "/sales" },
  { name: "customers", label: "Customers", href: "/customers" },
  { name: "inventory", label: "Stock", href: "/inventory" },
  { name: "report", label: "Report", href: "/report" },
];

export default function AppTabs() {
  return (
    <Tabs className="h-full bg-paper">
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View className="flex w-full flex-row justify-center gap-2 border-t border-line bg-paper px-4 py-3">
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props}>
      {({ pressed }) => (
        <View
          className={`rounded-md px-3 py-1.5 ${isFocused ? "bg-accent-tint" : ""} ${
            pressed ? "opacity-70" : ""
          }`}>
          <Text
            className={`text-sm ${isFocused ? "font-semibold text-accent" : "font-medium text-ink-soft"}`}>
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}