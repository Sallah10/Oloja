import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { rawRequest } from "@/lib/api";
import { getSyncStatus, requestSync, subscribeSync } from "@/lib/offline";

type Status = ReturnType<typeof getSyncStatus>;

// A small pill that sits on the tab header and quietly tells the truth about
// connectivity: offline vs online, whether anything is still queued, and a
// one-line hint when a queued change was refused by the server (e.g. a sale
// that ran out of stock on the other side). Tapping it retries the sync.
export function SyncBanner() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>(getSyncStatus);

  useEffect(() => subscribeSync(() => setStatus(getSyncStatus())), []);

  if (status.online && status.pending === 0 && !status.lastError) return null;

  const parts: string[] = [];
  if (!status.online) parts.push("Offline");
  if (status.pending > 0) {
    parts.push(`${status.pending} change${status.pending === 1 ? "" : "s"} queued`);
  }
  if (status.lastError) parts.push(`1 failed: ${status.lastError}`);

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 z-20 items-center"
      style={{ top: (insets.top ?? 0) + 54 }}
    >
      <Pressable
        onPress={() => void requestSync(rawRequest)}
        accessibilityRole="button"
        accessibilityLabel={`Sync status: ${parts.join(", ")}. Tap to retry`}
        className="max-w-[90%] rounded-full border border-line bg-paper-card px-3 py-1.5 shadow-sm"
      >
        <View className="flex-row items-center gap-1.5">
          <View
            className={`h-1.5 w-1.5 rounded-full ${
              status.online ? "bg-accent" : "bg-danger"
            }`}
          />
          <Text className="text-[11px] font-medium text-ink-soft">{parts.join(" · ")}</Text>
        </View>
      </Pressable>
    </View>
  );
}