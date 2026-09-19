import { Text, View } from "react-native";

import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";

export default function InventoryScreen() {
  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-2xl font-semibold text-ink">Stock</Text>
      </View>
      <EmptyState
        title="No products yet"
        body="Add the goods you sell, set how much you bought them for, and this tracks your stock levels so you know when to restock."
      />
    </Screen>
  );
}