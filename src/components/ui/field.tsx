import { useState } from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";

import { cn } from "@/lib/cn";

type FieldProps = TextInputProps & {
  label: string;
};

export function Field({ label, className, ...inputProps }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink-soft">{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor="#A49D8E"
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
        className={cn(
          "h-12 rounded-md border bg-paper-card px-3 text-base text-ink",
          focused ? "border-accent" : "border-line",
          className,
        )}
      />
    </View>
  );
}