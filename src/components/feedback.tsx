import { Ionicons } from "@expo/vector-icons";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";

import { Colors, Shadows } from "@/constants/theme";

type ToastTone = "success" | "error" | "info";

type ToastInput = { message: string; tone: ToastTone };

type FeedbackContextValue = {
  /** Surface a transient confirmation. Fades after a moment on its own. */
  show: (message: string, tone?: ToastTone) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

const HOLD_MS = 2600;

const palette: Record<ToastTone, { bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: Colors.light.accentDeep, icon: "checkmark" },
  error: { bg: Colors.light.dangerDeep, icon: "alert" },
  info: { bg: "#3D3527", icon: "information" },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(8));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 8, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, tone, id: Date.now() });
      opacity.setValue(0.001);
      translateY.setValue(8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 16,
          stiffness: 240,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
      hideTimer.current = setTimeout(dismiss, HOLD_MS);
    },
    [dismiss, opacity, translateY],
  );

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
          <Animated.View
            style={[
              styles.toast,
              { backgroundColor: palette[toast.tone].bg, opacity, transform: [{ translateY }] },
            ]}>
            <Ionicons name={palette[toast.tone].icon} size={16} color="#FFF" />
            <Text weight="medium" className="text-sm text-white" style={{ color: "#FFFFFF" }}>
              {toast.message}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </FeedbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    ...Platform.select({ web: { position: "fixed" as const } }),
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    maxWidth: "92%",
    ...Shadows.float,
  },
});