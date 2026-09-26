import { Ionicons } from "@expo/vector-icons";
import { Href, useRouter } from "expo-router";
import { Pressable } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

import { Colors } from "@/constants/theme";

/**
 * Back affordance for stack screens rendered without a navigation header.
 * Goes back one step where that's possible; otherwise it falls back to the
 * tab it belongs to (`fallback`), so the tab bar is never more than one tap
 * away - even after a hard refresh on the web.
 */
export function BackLink({ fallback = "/", className }: { fallback?: Href; className?: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      className={cn("h-9 min-w-9 flex-row items-center justify-center gap-1 pr-1", className)}>
      <Ionicons name="chevron-back" size={18} color={Colors.light.accentDeep} />
      <Text weight="semibold" className="text-sm text-accent-deep">
        Back
      </Text>
    </Pressable>
  );
}