import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { compileQuery, firstVisible, findRanges, MATCH_LIMIT, matchLabel, replacement, stepIndex, type FindOptions, type FindTarget, type Found } from "./find";

/** How long after an edit the matches are found again; until then they move with the text. */
const CHANGE_DELAY = 150;

const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : undefined;

/** Scrolls `scroller` (and a horizontally scrolling code block) so `range` is visible. */
function reveal(range: Range, scroller: HTMLElement) {
  const pre = range.startContainer.parentElement?.closest("pre");
  if (pre && pre.scrollWidth > pre.clientWidth) {
    const r = range.getBoundingClientRect();
    const box = pre.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) pre.scrollLeft += r.left - box.left - box.width / 3;
  }
  const r = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (r.top < box.top + 8 || r.bottom > box.bottom - 8) scroller.scrollBy({ top: r.top - box.top - box.height / 3 });
}

/** The reading view as a find target: its rendered DOM, painted with the CSS Custom Highlight API, find only. */
function readingTarget(root: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>): FindTarget<Found & { range: Range }> {
  return {
    find: (query, limit) => (root.current ? findRanges(root.current, query, limit) : []),
    top: (f) => f.range.getBoundingClientRect().top,
    show(found, current, scroll) {
      highlights?.set("find", new Highlight(...found.map((f) => f.range)));
      const f = found[current];
      if (!f) return void highlights?.delete("find-current");
      highlights?.set("find-current", new Highlight(f.range));
      if (scroll && scroller.current) reveal(f.range, scroller.current);
    },
    clear() {
      highlights?.delete("find");
      highlights?.delete("find-current");
    },
  };
}

type Args = {
  /** The editor's or the Source view's target; the reading view's rendered DOM under `root` without one. */
  target: FindTarget | undefined;
  root: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  /** Changes whenever the reading view's DOM is replaced, so matches are found again. */
  content: unknown;
  query: string;
  options: FindOptions;
};

/** The find bar's matches, the current one, and replacing them. */
export function useFind({ target: given, root, scroller, content, query, options }: Args) {
  const reading = useMemo(() => readingTarget(root, scroller), [root, scroller]);
  const target: FindTarget = given ?? reading;
  // `reveal` is false after a search that only followed an edit, so typing doesn't scroll back to the current match.
  const [found, setFound] = useState<{ target?: FindTarget; all: Found[]; more: boolean; error?: string; searched: boolean; reveal: boolean }>({
    all: [],
    more: false,
    searched: false,
    reveal: false,
  });
  const [index, setIndex] = useState(-1);
  // How many matches Replace all replaced, shown until the search changes.
  const [replaced, setReplaced] = useState<number>();
  const [changes, setChanges] = useState(0);
  const last = useRef<{ target: FindTarget; query: string; options: FindOptions }>(undefined);
  // After Replace, the next match is the first one from where the new text ends.
  const resume = useRef<number>(undefined);
  const edited = useRef(false);
  const shownIndex = useRef(-1);

  useEffect(() => {
    let timer = 0;
    const stop = target.watch?.(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        edited.current = true;
        setChanges((c) => c + 1);
      }, CHANGE_DELAY);
    });
    return () => {
      clearTimeout(timer);
      stop?.();
    };
  }, [target]);

  // Search again when the search, the view or its content changes. A new search starts at the first match in view.
  useEffect(() => {
    const compiled = compileQuery(query, options);
    const all = compiled && !("error" in compiled) ? target.find(compiled, MATCH_LIMIT + 1) : [];
    const more = all.length > MATCH_LIMIT;
    if (more) all.length = MATCH_LIMIT;
    const fresh = last.current?.target !== target || last.current.query !== query || last.current.options !== options;
    last.current = { target, query, options };
    if (fresh) setReplaced(undefined);
    const at = resume.current;
    resume.current = undefined;
    const error = compiled && "error" in compiled ? compiled.error : undefined;
    setFound({ target, all, more, error, searched: !!compiled, reveal: fresh || at !== undefined || !edited.current });
    edited.current = false;
    if (at !== undefined) setIndex(all.length ? Math.max(all.findIndex((f) => f.from >= at), 0) : -1);
    else setIndex((i) => (fresh || i < 0 ? firstVisible(all.map(target.top), scroller.current?.getBoundingClientRect().top ?? 0) : Math.min(i, all.length - 1)));
  }, [target, query, options, content, changes, scroller]);

  useEffect(() => {
    if (found.target !== target) return;
    target.show(found.all, index, found.reveal || index !== shownIndex.current);
    shownIndex.current = index;
  }, [target, found, index]);

  useEffect(() => () => target.clear(), [target]);

  const step = (n: number) => {
    setReplaced(undefined);
    setIndex((i) => stepIndex(i, n, found.all.length));
  };

  /** Replaces the current match and goes on to the next one. */
  function replaceOne(template: string) {
    const f = found.all[index];
    if (!f || !target.replace) return;
    resume.current = target.replace([f], [replacement(template, f.match, options.regex)]);
    setChanges((c) => c + 1);
  }

  /** Replaces every match, past the limit of those shown too, in one undo step. */
  function replaceAll(template: string) {
    const compiled = compileQuery(query, options);
    if (!compiled || "error" in compiled || !target.replace) return;
    const all = target.find(compiled, Infinity);
    target.replace(
      all,
      all.map((f) => replacement(template, f.match, options.regex)),
    );
    setChanges((c) => c + 1);
    setReplaced(all.length);
  }

  const label = found.error ?? (replaced !== undefined ? `Replaced ${replaced}` : found.searched ? matchLabel(index, found.all.length, found.more) : "");
  return { count: found.all.length, error: found.error, label, step, canReplace: !!target.replace, replaceOne, replaceAll };
}
