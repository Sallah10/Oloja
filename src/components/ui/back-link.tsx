import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

// A terse back affordance for stack screens that leave the header hidden.
export function BackLink() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      className="h-8 justify-center pr-1">
      <Text className="text-sm font-medium text-accent">‹ Back</Text>
    </Pressable>
  );
}