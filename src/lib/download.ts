import { Platform } from "react-native";

/**
 * Puts a small text file (a CSV template) into the owner's hands. On web that
 * is a straight browser download; on a phone it writes the file to cache and
 * opens the OS share sheet so it can be saved to Files, Drive or sent to a
 * computer - the same template works either way.
 */
export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/csv;charset=utf-8",
): Promise<void> {
  const bom = "\uFEFF";

  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const blob = new Blob([`${bom}${content}`], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    const { File, Paths } = await import("expo-file-system");
    const { default: Sharing } = await import("expo-sharing");
    if (!(await Sharing.isAvailableAsync())) return;
    const file = new File(Paths.cache, filename);
    file.write(`${bom}${content}`);
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: "Save the template",
      UTI: "public.comma-separated-values-text",
    });
  } catch {
    // Sharing isn't available - the copy fallback is always shown next to it.
  }
}