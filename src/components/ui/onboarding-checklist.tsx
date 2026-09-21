import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

export type OnboardingStep = {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  disabled?: boolean;
};

/**
 * The "getting started" story for a brand-new shop. It lists the three first
 * steps in order and nudges the owner to the exact screen each one needs. It
 * disappears on its own once a step can't be aided (all are done).
 */
export function OnboardingChecklist({
  shopName,
  steps,
  onChoose,
}: {
  shopName: string;
  steps: OnboardingStep[];
  onChoose: (step: OnboardingStep) => void;
}) {
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <View className="rounded-2xl border border-gold/40 bg-gold-tint/60 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text display weight="semibold" className="text-lg leading-6 text-ink">
            Your ledger is forming
          </Text>
        </View>
        <View className="rounded-full bg-paper-card px-2.5 py-1">
          <Text weight="semibold" className="text-xs" style={{ color: "#B98A2F" }}>
            {doneCount} of {steps.length} done
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-sm leading-5 text-ink-soft">
        {shopName} isn&apos;t trading yet. Three little steps and it will be - do them in any order.
      </Text>

      <View className="mt-4 gap-2">
        {steps.map((step) => (
          <Pressable
            key={step.key}
            accessibilityRole="button"
            disabled={step.disabled}
            onPress={() => onChoose(step)}
            className={cn(
              "flex-row items-center gap-3 rounded-xl border border-gold/30 bg-paper-card px-3.5 py-3",
              step.disabled && "opacity-55",
            )}>
            <View
              className={cn(
                "h-7 w-7 items-center justify-center rounded-full",
                step.done ? "bg-accent" : "border border-gold/50 bg-paper-card",
              )}>
              {step.done ? (
                <Ionicons name="checkmark" size={15} color="#FFFFFF" />
              ) : (
                <Text weight="bold" className="text-xs" style={{ color: "#B98A2F" }}>
                  {steps.indexOf(step) + 1}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text weight="semibold" className="text-sm leading-5 text-ink">
                {step.title}
              </Text>
              <Text className="mt-0.5 text-xs leading-4 text-ink-soft">{step.hint}</Text>
            </View>
            {step.disabled ? (
              <Text className="text-[11px] text-ink-faint">Later</Text>
            ) : (
              <Ionicons name="chevron-forward" size={16} color="#B3A78D" />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}