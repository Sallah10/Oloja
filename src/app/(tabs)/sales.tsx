import { Text, View } from "react-native";

import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";

export default function SalesScreen() {
  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-2xl font-semibold text-ink">Sales</Text>
      </View>
      <EmptyState
        title="No sales yet"
        body="When you sell - cash or on credit - record it here. Each sale updates what a customer owes you automatically."
      />
    </Screen>
  );
}