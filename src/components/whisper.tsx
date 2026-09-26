import { Ionicons } from "@expo/vector-icons";
import { Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { notifyUrgentCards } from "@/lib/notifications";
import type { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";
import { whisper, type WhisperCard, type WhisperTone } from "@/lib/whisper";

const TONES: Record<WhisperTone, { tile: string; color: string }> = {
  accent: { tile: "bg-accent-tint", color: "#1F5D3C" },
  gold: { tile: "bg-gold-tint", color: "#B98A2F" },
  danger: { tile: "bg-danger-tint", color: "#AC4431" },
  neutral: { tile: "bg-line-soft", color: "#7A6E5A" },
};

/**
 * The whisper - the on-device advisor reading the ledger. It stays on the Home
 * screen so the owner glances at it first thing: the day's most useful behind
 * the day's numbers.
 */
export function WhisperSection({
  products,
  customers,
  transactions,
}: {
  products: ProductSummary[];
  customers: CustomerSummary[];
  transactions: TransactionSummary[];
}) {
  const router = useRouter();
  const thread = whisper(products, customers, transactions);

  const dangerKey = thread.cards.filter((c) => c.tone === "danger").map((c) => c.id).join(",");
  useEffect(() => {
    if (!dangerKey) return;
    const urgent = thread.cards.filter((c) => c.tone === "danger");
    void notifyUrgentCards(urgent);
  }, [dangerKey]);

  return (
    <View className="mt-6">
      <SectionHeader
        title="The whisper"
        className="mb-2.5"
        action={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/whisper")}
            className="flex-row items-center gap-1 active:opacity-70">
            <Text className="text-xs text-ink-faint">The full read</Text>
            <Ionicons name="chevron-forward" size={13} color="#B3A78D" />
          </Pressable>
        }
      />
      <View className="mb-2.5 flex-row items-center gap-1.5">
        <Ionicons name="ear-outline" size={13} color="#B3A78D" />
        <Text className="text-xs text-ink-faint">{thread.headline}</Text>
      </View>
      <View className="gap-3">
        {thread.cards.map((card) => (
          <WhisperRow key={card.id} card={card} />
        ))}
      </View>
    </View>
  );
}

export function WhisperRow({ card }: { card: WhisperCard }) {
  const router = useRouter();
  const tone = TONES[card.tone];
  const onPress = () => {
    if (card.action) router.navigate(card.action.path as Href);
  };

  return (
    <Card onPress={card.action ? onPress : undefined} className="flex-row items-center gap-3 px-4 py-3.5">
      <View className={cn("h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone.tile)}>
        <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={18} color={tone.color} />
      </View>
      <View className="flex-1 pr-1">
        <Text className="text-xs text-ink-faint">{card.title}</Text>
        <Text weight="semibold" className="mt-0.5 text-sm leading-5 text-ink">
          {card.body}
        </Text>
        {card.action ? (
          <View className="mt-1.5 flex-row items-center gap-1">
            <Text weight="semibold" className="text-xs text-accent">
              {card.action.label}
            </Text>
            <Ionicons name="chevron-forward" size={13} color="#1F5D3C" />
          </View>
        ) : null}
      </View>
    </Card>
  );
}