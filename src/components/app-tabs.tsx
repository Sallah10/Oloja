import { NativeTabs } from "expo-router/unstable-native-tabs";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Colors.light.background}
      iconColor={{ default: Colors.light.inkFaint, selected: Colors.light.accent }}
      labelStyle={{
        default: { color: Colors.light.inkSoft },
        selected: { color: Colors.light.accent },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sales">
        <NativeTabs.Trigger.Label>Sales</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart" md="receipt_long" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="customers">
        <NativeTabs.Trigger.Label>Customers</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="group" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inventory">
        <NativeTabs.Trigger.Label>Stock</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox" md="inventory_2" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}