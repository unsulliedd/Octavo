/** What a test answers a dialog with: a button's label, or for a prompt, the text to type before pressing it. */
export type DialogAnswer = string | { label: string; text: string };

/**
 * For tests: answers each app dialog (dialog.ts) as it opens, with the button whose label `pick` returns for
 * the dialog's text, button labels and title. Returns a function that stops answering and dismisses a dialog left open.
 */
export function answerDialogs(pick: (text: string, labels: string[], title: string) => DialogAnswer | Promise<DialogAnswer>) {
  const seen = new WeakSet<Element>();
  const observer = new MutationObserver(() => {
    for (const box of document.querySelectorAll(".app-dialog")) {
      if (seen.has(box)) continue;
      seen.add(box);
      const buttons = [...box.querySelectorAll("button")];
      const text = box.querySelector("p")?.textContent ?? "";
      void Promise.resolve(pick(text, buttons.map((b) => b.textContent!), box.querySelector("h2")!.textContent!)).then((answer) => {
        const label = typeof answer === "string" ? answer : answer.label;
        const field = box.querySelector("input");
        if (typeof answer !== "string" && field) {
          field.value = answer.text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const button = buttons.find((b) => b.textContent === label);
        if (!button) throw new Error(`No button "${label}" in the dialog "${text}"`);
        button.click();
      });
    }
  });
  observer.observe(document.body, { childList: true });
  return () => {
    observer.disconnect();
    while (document.querySelector(".app-dialog")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  };
}
