import { RefObject, useEffect } from 'react';

/**
 * Lets every data table in the admin turn into a list of cards on phones
 * (see `table[data-cards]` in index.css) without each page opting in.
 *
 * Each body cell gets `data-label` from its column heading, and the cells that
 * get special places in the card are marked with `data-cell`:
 *   check   – the row-selection checkbox (top left)
 *   primary – the first real column, usually the title (top, full width)
 *   actions – the last column of buttons/menus, unlabelled or "Actions" (top right)
 *   tool    – other unlabelled button columns (expand arrows, stars): kept small
 * Tables can opt out with `data-no-cards`.
 */
export function useCardTables(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;

    const label = (table: HTMLTableElement) => {
      if (table.hasAttribute('data-no-cards')) return;
      const head = table.tHead?.rows[table.tHead.rows.length - 1];
      if (!head) return;
      // Column index -> heading text, honouring colspans.
      const titles: string[] = [];
      for (const th of Array.from(head.cells)) {
        const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
        for (let i = 0; i < th.colSpan; i++) titles.push(text);
      }
      const isCheck = (td: HTMLTableCellElement) =>
        !!td.querySelector('input[type="checkbox"]') && (td.textContent || '').trim() === '';
      table.setAttribute('data-cards', '');
      for (const body of Array.from(table.tBodies)) {
        for (const row of Array.from(body.rows)) {
          let col = 0;
          const cells = Array.from(row.cells).map((td) => {
            const title = titles[col] ?? '';
            const span = td.colSpan;
            col += span;
            return { td, title, span };
          });
          const isButtons = (td: HTMLTableCellElement) => !!td.querySelector('button, a, [role="button"]');
          const actionLike = cells.filter((c) => (!c.title || /^actions?$/i.test(c.title)) && !isCheck(c.td) && isButtons(c.td));
          const actions = actionLike[actionLike.length - 1]?.td;
          // The title is the first labelled column; unlabelled ones (expand
          // arrows, icons, stars) are kept small. Fall back to the first plain cell.
          const plain = cells.filter((c) => !isCheck(c.td) && c.td !== actions && c.span < titles.length - 1);
          const primary = (plain.find((c) => c.title) ?? plain[0])?.td;
          for (const { td, title, span } of cells) {
            if (span >= titles.length - 1 && titles.length > 2) { td.setAttribute('data-cell', 'full'); continue; }
            let kind = '';
            if (isCheck(td)) kind = 'check';
            else if (td === actions) kind = 'actions';
            else if (td === primary) kind = 'primary';
            else if (!title) kind = 'tool';
            if (kind) td.setAttribute('data-cell', kind); else td.removeAttribute('data-cell');
            if (td.getAttribute('data-label') !== title) td.setAttribute('data-label', title);
          }
          row.toggleAttribute('data-has-check', !!row.querySelector('[data-cell="check"]'));
        }
      }
    };

    const run = () => {
      frame = 0;
      el.querySelectorAll('table').forEach((t) => label(t as HTMLTableElement));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [root]);
}
