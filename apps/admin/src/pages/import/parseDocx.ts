import { FieldKey, fieldForLabel } from './importFormat';

/** One post as written in the document, before any validation. */
export interface DocPost {
  /** Source file name and 1-based position, for messages. */
  file: string;
  index: number;
  title: string;
  fields: Partial<Record<FieldKey, string>>;
  /** Featured image pasted into the details table, as a data: URI. */
  featuredImageData?: string;
  /** Sanitised body HTML; images are still data: URIs until import. */
  html: string;
  wordCount: number;
  imageCount: number;
  hasTable: boolean;
}

export interface ParseResult {
  posts: DocPost[];
  /** Problems with the file as a whole (not tied to a post). */
  notes: string[];
}

const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sup', 'sub', 'a', 'ul', 'ol', 'li',
  'blockquote', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'code', 'pre',
]);
const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp|tiff);base64,/i;
const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;

/**
 * Keep only simple formatting. Word content is the user's own, but links can
 * carry any scheme (e.g. javascript:) and must never reach the editor as-is.
 */
function sanitize(root: Element) {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap unknown wrappers (e.g. span) but keep their text.
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const keep =
        (tag === 'a' && name === 'href' && SAFE_LINK.test(attr.value.trim())) ||
        (tag === 'img' && name === 'src' && (SAFE_IMAGE.test(attr.value) || /^https?:\/\//i.test(attr.value))) ||
        (tag === 'img' && name === 'alt') ||
        ((tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan'));
      if (!keep) el.removeAttribute(name);
    }
    if (tag === 'a') {
      if (!el.getAttribute('href')) el.replaceWith(...Array.from(el.childNodes));
      else { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    }
    if (tag === 'img' && !el.getAttribute('src')) el.remove();
  }
  // Mammoth emits bookmark anchors and empty paragraphs; drop the empties.
  for (const el of Array.from(root.querySelectorAll('p'))) {
    if (!el.textContent?.trim() && !el.querySelector('img, br')) el.remove();
  }
}

/** Read a details table; returns null when it doesn't look like one. */
function readDetailsTable(table: Element): { fields: Partial<Record<FieldKey, string>>; image?: string } | null {
  const fields: Partial<Record<FieldKey, string>> = {};
  let image: string | undefined;
  let matched = 0;
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length < 2) continue;
    const key = fieldForLabel(cells[0].textContent ?? '');
    if (!key) continue;
    matched++;
    const valueCell = cells[1];
    if (key === 'featuredImage') {
      const img = valueCell.querySelector('img');
      if (img?.getAttribute('src')) image = img.getAttribute('src')!;
    }
    // Paragraphs inside a cell become lines, so lists like tags can be one per line.
    const text = Array.from(valueCell.querySelectorAll('p')).map((p) => p.textContent?.trim() ?? '').filter(Boolean).join('\n')
      || valueCell.textContent?.trim() || '';
    fields[key] = text;
  }
  return matched >= 2 ? { fields, image } : null;
}

export async function parseDocx(file: File): Promise<ParseResult> {
  const notes: string[] = [];
  if (!/\.docx$/i.test(file.name)) {
    return { posts: [], notes: [`${file.name}: only .docx files are supported. In Word use File → Save As → Word Document (.docx).`] };
  }

  const mod = await import('mammoth/mammoth.browser.min.js');
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;

  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        externalFileAccess: false,
        styleMap: [
          // Word's "Quote"/"Intense Quote" styles become blockquotes.
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Intense Quote'] => blockquote > p:fresh",
          "r[style-name='Strong'] => strong",
        ],
      },
    );
    html = result.value;
    const unsupportedImages = result.messages.filter((m) => /image/i.test(m.message)).length;
    if (unsupportedImages) notes.push(`${file.name}: ${unsupportedImages} picture(s) are in a format browsers can't show (e.g. EMF) and were skipped.`);
  } catch {
    return { posts: [], notes: [`${file.name}: couldn't be read. Make sure it's a Word .docx file that isn't password-protected.`] };
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const nodes = Array.from(doc.body.childNodes);

  const posts: DocPost[] = [];
  let current: { title: string; nodes: ChildNode[] } | null = null;
  const sections: { title: string; nodes: ChildNode[] }[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'H1') {
      current = { title: (node.textContent ?? '').replace(/\s+/g, ' ').trim(), nodes: [] };
      sections.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
  }

  if (sections.length === 0) {
    notes.push(`${file.name}: no posts found. Each post title must use the “Heading 1” style — see the template.`);
  }

  sections.forEach((section, i) => {
    const container = doc.createElement('div');
    let fields: Partial<Record<FieldKey, string>> = {};
    let featuredImageData: string | undefined;

    // The first table directly under the title is the details table.
    const firstEl = section.nodes.find((n) => n.nodeType === Node.ELEMENT_NODE && ((n as Element).textContent?.trim() || (n as Element).querySelector('img')));
    for (const node of section.nodes) {
      if (node === firstEl && (node as Element).tagName === 'TABLE') {
        const details = readDetailsTable(node as Element);
        if (details) {
          fields = details.fields;
          featuredImageData = details.image && SAFE_IMAGE.test(details.image) ? details.image : undefined;
          continue;
        }
      }
      container.appendChild(node);
    }

    sanitize(container);
    const text = container.textContent ?? '';
    posts.push({
      file: file.name,
      index: i + 1,
      title: section.title,
      fields,
      featuredImageData,
      html: container.innerHTML.trim(),
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      imageCount: container.querySelectorAll('img').length,
      hasTable: !!container.querySelector('table'),
    });
  });

  return { posts, notes };
}

/** Turn a data: URI into a File for upload. */
export function dataUriToFile(uri: string, baseName: string): File | null {
  const m = uri.match(/^data:(image\/[\w.+-]+);base64,(.*)$/i);
  if (!m) return null;
  const [, mime, b64] = m;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  return new File([bytes], `${baseName}.${ext}`, { type: mime });
}
