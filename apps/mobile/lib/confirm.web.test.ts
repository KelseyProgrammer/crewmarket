import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmDestructive } from "./confirm.web";

// Web confirm shim: Alert.alert button dialogs are a SILENT NO-OP on
// react-native-web, so the web platform file must route through
// window.confirm and preserve the promise-of-boolean contract.
describe("confirmDestructive (web)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves true when the user confirms", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    await expect(
      confirmDestructive({
        title: "Remove this document?",
        message: "This deletes the file and its record.",
        confirmLabel: "Remove",
        cancelLabel: "Keep it",
      }),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("resolves false when the user cancels", async () => {
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    await expect(
      confirmDestructive({
        title: "Remove this document?",
        message: "This deletes the file and its record.",
        confirmLabel: "Remove",
        cancelLabel: "Keep it",
      }),
    ).resolves.toBe(false);
  });

  it("shows the title and message in the browser dialog", async () => {
    const confirm = vi.fn((_message?: string) => true);
    vi.stubGlobal("window", { confirm });
    await confirmDestructive({
      title: "Remove this document?",
      message: "This deletes the file and its record.",
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
    });
    const shown = confirm.mock.calls[0]?.[0] ?? "";
    expect(shown).toContain("Remove this document?");
    expect(shown).toContain("This deletes the file and its record.");
  });
});
