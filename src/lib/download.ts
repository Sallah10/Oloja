import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

export type DownloadOutcome = "downloaded" | "shared" | "copied" | "failed";

/**
 * Puts a small text file (a CSV template) into the owner's hands:
 *  - web: a straight browser download.
 *  - phone: the file is written to cache and the OS share sheet opens so it
 *    can be saved to Files, Drive or sent to a computer. If sharing is not
 *    available the template is copied to the clipboard instead of failing
 *    silently, and the caller is told what actually happened.
 */
export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/csv;charset=utf-8",
): Promise<DownloadOutcome> {
  const bom = "\uFEFF";

  if (Platform.OS === "web") {
    if (typeof document === "undefined") return "failed";
    const blob = new Blob([`${bom}${content}`], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return "downloaded";
  }

  try {
    const { File, Paths } = await import("expo-file-system");
    const { default: Sharing } = await import("expo-sharing");
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(`${bom}${content}`);
    if (!(await Sharing.isAvailableAsync())) {
      await Clipboard.setStringAsync(content);
      return "copied";
    }
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: "Save the template",
      UTI: "public.comma-separated-values-text",
    });
    return "shared";
  } catch {
    try {
      await Clipboard.setStringAsync(content);
      return "copied";
    } catch {
      return "failed";
    }
  }
}