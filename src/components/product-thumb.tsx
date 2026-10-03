import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { authHeaders } from "@/lib/api";
import { cn } from "@/lib/cn";
import { productImageUrl } from "@/lib/product-image";

/**
 * A product's shelf photo, or the coloured tile the inventory list shows when
 * there isn't one. The photo endpoint needs the session token like every other
 * API route, so the header travels with the request rather than baking a
 * public image URL into the data.
 */
export function ProductThumb({
  productId,
  hasImage,
  name,
  imageVersion,
  size = "md",
  tone = "accent",
  className,
}: {
  productId: string;
  hasImage: boolean;
  name: string;
  imageVersion?: string | null;
  size?: "sm" | "md" | "lg";
  tone?: "accent" | "gold" | "danger";
  className?: string;
}) {
  const box = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-32 w-32" : "h-14 w-14";
  const radius = size === "lg" ? "rounded-2xl" : "rounded-xl";
  const url = productImageUrl(productId, hasImage, imageVersion);

  if (!url) {
    return (
      <View
        className={cn(
          "items-center justify-center overflow-hidden",
          box,
          radius,
          tone === "danger" ? "bg-danger-tint" : tone === "gold" ? "bg-gold-tint" : "bg-accent-tint",
          className,
        )}>
        <Ionicons
          name="image-outline"
          size={size === "lg" ? 28 : 17}
          color={tone === "danger" ? "#AC4431" : tone === "gold" ? "#B98A2F" : "#1F5D3C"}
        />
        {size === "lg" ? (
          <Text className="mt-1 px-2 text-center text-xs text-ink-faint">No photo yet</Text>
        ) : null}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url, headers: authHeaders() }}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={`Photo of ${name}`}
      className={cn("overflow-hidden bg-line-soft", box, radius, className)}
    />
  );
}