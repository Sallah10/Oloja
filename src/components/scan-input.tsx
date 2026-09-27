import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  type BarcodeScanningResult,
  type BarcodeType,
  useCameraPermissions,
} from "expo-camera";
import { useRef, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

import { Text as T } from "@/components/ui/text";

const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "codabar",
  "itf14",
  "qr",
];

/**
 * A small pill that opens the camera to read a barcode. The code is handed to
 * onScan once, then the scanner closes - the caller decides what it means
 * (store it on a product, jump straight to it on the till...). Web keeps just
 * the entry point hidden; camera scanning is a phone thing in Oloja.
 */
export function ScanBarcodeButton({
  onScan,
  label = "Scan barcode",
}: {
  onScan: (code: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (Platform.OS === "web") return null;

  const openScanner = () => {
    handled.current = false;
    if (permission?.granted) {
      setOpen(true);
      return;
    }
    void requestPermission().then(() => setOpen(true));
  };

  const onBarcode = (result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code || handled.current) return;
    handled.current = true;
    setOpen(false);
    onScan(code);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={openScanner}
        className="flex-row items-center gap-1.5 self-start rounded-full border border-accent-deep bg-accent-tint px-3.5 py-2 active:opacity-75">
        <Ionicons name="barcode-outline" size={16} color="#1F5D3C" />
        <T weight="medium" className="text-xs text-accent-deep">
          {label}
        </T>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-black">
          {permission?.granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={onBarcode}
            />
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <Ionicons name="camera-outline" size={44} color="#B3A78D" />
              <T weight="semibold" className="mt-4 text-center text-lg text-white">
                Camera access is off
              </T>
              <T className="mt-2 text-center text-sm leading-5 text-white/60">
                Allow the camera for Oloja in your phone&apos;s settings, then come back here to
                scan.
              </T>
            </View>
          )}

          <View className="absolute inset-x-0 top-16 items-center px-6">
            <T className="text-center text-sm text-white/80">
              Point the camera at the barcode on the shelf
            </T>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            className="absolute right-4 top-16 rounded-full bg-white/15 p-3">
            <Ionicons name="close" size={22} color="#FFF" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}