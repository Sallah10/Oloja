import { PropsWithChildren } from "react";
import { Text, View } from "react-native";

type EmptyStateProps = PropsWithChildren<{
  title: string;
  body: string;
}>;

export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Text className="text-center text-base font-semibold text-ink">{title}</Text>
      <Text className="mt-2 max-w-md text-center text-sm leading-5 text-ink-soft">{body}</Text>
      {children ? <View className="mt-6">{children}</View> : null}
    </View>
  );
}