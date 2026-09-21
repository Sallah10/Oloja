import { useState } from "react";
import { TextInput, TextInputProps, View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type FieldProps = TextInputProps & {
  label: string;
  helper?: string;
  error?: string;
};

/**
 * A labelled text input with a focus ring, a helper line, and inline error
 * text. The label and helper live above so a busy owner's eyes never leave.
 */
export function Field({
  label,
  helper,
  error,
  className,
  editable = true,
  ...inputProps
}: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={cn("gap-1.5", className)}>
      <Text weight="medium" className="text-sm text-ink-soft">
        {label}
      </Text>
      <TextInput
        {...inputProps}
        editable={editable}
        placeholderTextColor="#B3A78D"
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
        className={cn(
          "h-[52px] rounded-xl border bg-paper-card px-3 text-base text-ink",
          !editable && "opacity-60",
          error ? "border-danger" : focused ? "border-accent" : "border-line",
        )}
      />
      {error ? (
        <Text className="text-[13px] text-danger">{error}</Text>
      ) : helper ? (
        <Text className="text-xs text-ink-faint">{helper}</Text>
      ) : null}
    </View>
  );
}