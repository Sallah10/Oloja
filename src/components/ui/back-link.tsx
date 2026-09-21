import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

import { Colors } from "@/constants/theme";

/** Back affordance for stack screens rendered without a navigation header. */
export function BackLink({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      className={cn("h-9 min-w-9 flex-row items-center justify-center gap-1 pr-1", className)}>
      <Ionicons name="chevron-back" size={18} color={Colors.light.accentDeep} />
      <Text weight="semibold" className="text-sm text-accent-deep">
        Back
      </Text>
    </Pressable>
  );
}