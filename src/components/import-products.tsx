import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File as FileSystemFile } from "expo-file-system";
import { useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";

import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Text as T } from "@/components/ui/text";
import { api } from "@/lib/api";
import { parseProductsCsv, PRODUCT_CSV_TEMPLATE, type CsvParseResult } from "@/lib/csv";
import { ApiError } from "@/lib/errors";

const ACCEPTED = ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel"];

export function ImportProductsCard({ onImported }: { onImported: () => void }) {
  const feedback = useFeedback();

  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<CsvParseResult | null>(null);
  const [running, setRunning] = useState(false);

  const reset = () => {
    setPreview(null);
    setPasteText("");
    setPasting(false);
  };

  const review = (text: string) => setPreview(parseProductsCsv(text));

  const copyTemplate = () => {
    void Clipboard.setStringAsync(PRODUCT_CSV_TEMPLATE);
    feedback.show("Template copied - paste it somewhere, fill it, then import the file", "info");
  };

  const downloadTemplate = () => {
    if (typeof document === "undefined") return;
    const blob = new Blob([`\uFEFF${PRODUCT_CSV_TEMPLATE}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oloja-products.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async () => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      const text =
        Platform.OS === "web" && asset.file
          ? await asset.file.text()
          : await new FileSystemFile(asset.uri).text();
      review(text);
    } catch {
      feedback.show("Could not read that file - is it a .csv?", "error");
    } finally {
      setPicking(false);
    }
  };

  // Each row is one product POST. Products can only be created online (server
  // issues the id), so a dropped connection stops the batch and reports what
  // made it through.
  const importAll = async (rows: CsvParseResult["rows"]) => {
    setRunning(true);
    let added = 0;
    const failures: string[] = [];
    let aborted = false;
    for (const row of rows) {
      try {
        await api("/api/products", {
          method: "POST",
          body: {
            name: row.name,
            priceMinor: row.priceMinor,
            costMinor: row.costMinor,
            lowStockThreshold: row.lowStockThreshold,
            initialStockQty: row.initialStockQty,
          },
        });
        added++;
      } catch (err) {
        if (err instanceof ApiError) {
          failures.push(err.message);
        } else {
          failures.push("You lost connection part-way through.");
          aborted = true;
          break;
        }
      }
    }
    setRunning(false);

    if (added === 0) {
      feedback.show(failures[0] ?? "Nothing was added", "error");
    } else if (aborted) {
      feedback.show(`Added ${added}, then you dropped offline - the rest weren't tried`, "error");
    } else if (failures.length) {
      feedback.show(`Added ${added} · skipped ${failures.length}`, "success");
    } else {
      feedback.show(`Added ${added} product${added === 1 ? "" : "s"}`, "success");
    }

    setOpen(false);
    reset();
    onImported();
  };

  const ready = preview?.rows ?? [];
  const issues = preview?.errors ?? [];

  return open ? (
    <View className="mt-3 rounded-2xl border border-line bg-paper-card p-4">
      <View className="flex-row items-center justify-between">
        <T display weight="semibold" className="text-lg text-ink">
          Import a list
        </T>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setOpen(false)}>
          <Ionicons name="close" size={22} color="#B3A78D" />
        </Pressable>
      </View>
      <T className="mt-1 text-sm leading-5 text-ink-soft">
        Skip the typing: fill our template and add many products at once - costs, stock on hand and
        low-stock alerts come along.
      </T>

      {!preview ? (
        <>
          <View className="mt-4 flex-row gap-2">
            <Button title="Choose a .csv file" icon="document-text-outline" onPress={chooseFile} busy={picking} className="flex-1" />
            <Button title="Copy template" variant="secondary" onPress={copyTemplate} />
          </View>
          {Platform.OS === "web" ? (
            <Button title="Download the template instead" variant="ghost" size="sm" onPress={downloadTemplate} block={false} className="mt-2 self-start" />
          ) : null}

          {pasting ? (
            <View className="mt-3">
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                scrollEnabled={false}
                placeholder={"Paste rows here - one product per line:\nName,price,cost,quantity,alert"}
                placeholderTextColor="#B3A78D"
                className="h-28 rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink"
              />
              <View className="mt-3 flex-row gap-2">
                <Button
                  title="Review this list"
                  disabled={!pasteText.trim()}
                  onPress={() => review(pasteText)}
                  className="flex-1"
                />
                <Button title="Cancel" variant="secondary" onPress={() => setPasting(false)} />
              </View>
            </View>
          ) : (
            <Button
              title="…or paste a list instead"
              variant="ghost"
              size="sm"
              block={false}
              onPress={() => setPasting(true)}
              className="mt-2 self-start"
            />
          )}
        </>
      ) : (
        <>
          {preview.fatal ? (
            <T className="mt-4 text-sm text-danger">{preview.fatal}</T>
          ) : ready.length === 0 ? (
            <T className="mt-4 text-sm text-danger">
              Nothing usable in there. Each line needs a name and a price.
            </T>
          ) : (
            <View className="mt-4">
              <T weight="semibold" className="text-base text-ink">
                {ready.length} product{ready.length === 1 ? "" : "s"} ready · {issues.length} to fix
              </T>
              <View className="mt-2 gap-1">
                {ready.slice(0, 4).map((row) => (
                  <T key={row.line} className="text-sm text-ink-soft" numberOfLines={1}>
                    · {row.name} — ₦{(row.priceMinor / 100).toLocaleString("en-NG")}
                  </T>
                ))}
                {ready.length > 4 ? (
                  <T className="text-sm text-ink-faint">…and {ready.length - 4} more</T>
                ) : null}
              </View>
            </View>
          )}
          {issues.length ? (
            <View className="mt-3 rounded-xl bg-paper px-3 py-2">
              <T weight="medium" className="text-xs uppercase tracking-wide text-ink-faint">
                Skipped
              </T>
              {issues.slice(0, 5).map((issue) => (
                <T key={issue.line} className="mt-0.5 text-[13px] leading-5 text-ink-soft">
                  Line {issue.line}: {issue.reason}
                </T>
              ))}
              {issues.length > 5 ? <T className="text-[13px] text-ink-faint">…and {issues.length - 5} more</T> : null}
            </View>
          ) : null}

          <View className="mt-4 flex-row gap-2">
            <Button
              title={ready.length ? `Add ${ready.length}` : "Add"}
              disabled={!ready.length || running}
              onPress={() => void importAll(ready)}
              className="flex-1"
            />
            <Button title="Back" variant="secondary" disabled={running} onPress={reset} />
          </View>
        </>
      )}
    </View>
  ) : (
    <Button
      title="Import a list"
      icon="download-outline"
      variant="secondary"
      onPress={() => setOpen(true)}
      className="mt-3"
    />
  );
}