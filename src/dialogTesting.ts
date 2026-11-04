/**
 * For tests: answers each app dialog (dialog.ts) as it opens, with the button whose label `pick` returns for
 * the dialog's text and button labels. Returns a function that stops answering and dismisses a dialog left open.
 */
export function answerDialogs(pick: (text: string, labels: string[]) => string | Promise<string>) {
  const seen = new WeakSet<Element>();
  const observer = new MutationObserver(() => {
    for (const box of document.querySelectorAll(".app-dialog")) {
      if (seen.has(box)) continue;
      seen.add(box);
      const buttons = [...box.querySelectorAll("button")];
      const text = box.querySelector("p")!.textContent!;
      void Promise.resolve(pick(text, buttons.map((b) => b.textContent!))).then((label) => {
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
