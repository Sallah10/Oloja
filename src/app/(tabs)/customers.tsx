import { Text, View } from "react-native";

import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";

export default function CustomersScreen() {
  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-2xl font-semibold text-ink">Customers</Text>
      </View>
      <EmptyState
        title="Nobody owes you yet"
        body="When someone takes goods on credit, they get a page here with their balance and every payment they've made."
      />
    </Screen>
  );
}