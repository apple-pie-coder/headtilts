import { EXAMPLE_POSTS, FIELDS, FieldKey } from './importFormat';

/**
 * Build the downloadable .docx template. The `docx` library is loaded on
 * demand so it never weighs down the rest of the admin bundle.
 */
export async function buildTemplate(siteName = 'your site'): Promise<Blob> {
  const {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, PageBreak,
    Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx');

  // A4 with 1" margins → 9026 DXA of usable width.
  const CONTENT_W = 9026;
  const COL = [2600, CONTENT_W - 2600];
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CDD4' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

  const p = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) =>
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] });

  const cell = (children: InstanceType<typeof Paragraph>[], width: number, shade?: string) =>
    new TableCell({
      borders,
      width: { size: width, type: WidthType.DXA },
      margins: cellMargins,
      shading: shade ? { fill: shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      children,
    });

  const headerRow = (a: string, b: string) =>
    new TableRow({
      tableHeader: true,
      children: [
        cell([new Paragraph({ children: [new TextRun({ text: a, bold: true, color: 'FFFFFF' })] })], COL[0], '2F5597'),
        cell([new Paragraph({ children: [new TextRun({ text: b, bold: true, color: 'FFFFFF' })] })], COL[1], '2F5597'),
      ],
    });

  /** The Field | Value table that sits under each post title. */
  const detailsTable = (values: Partial<Record<FieldKey, string>>) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: COL,
      rows: [
        headerRow('Field', 'Value'),
        ...FIELDS.map((f) => new TableRow({
          children: [
            cell([new Paragraph({ children: [new TextRun({ text: f.label, bold: true })] })], COL[0], 'EEF2F8'),
            cell([new Paragraph({ children: [new TextRun(values[f.key] ?? '')] })], COL[1]),
          ],
        })),
      ],
    });

  const bullet = (children: (InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>)[]) =>
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children });
  const step = (text: string, ref = 'steps') =>
    new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: [new TextRun(text)] });

  const instructions = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Bulk post import')] }),
    p(`Write several posts for ${siteName} in this one document, then upload it from Posts → Import in the admin panel. You'll get a preview of every post before anything is saved.`, { color: '444444' }),

    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('How it works')] }),
    step('Every post starts with its title written in the “Heading 1” style (Home → Styles → Heading 1).'),
    step('Right under the title, fill in the details table. Leave a value blank to use the default, or delete rows you don\'t need.'),
    step('Write the post underneath the table. Use Heading 2 and Heading 3 for sections. Bold, italics, links, bullet and numbered lists, quotes and pictures are all kept.'),
    step('To add another post, copy a whole example (title, table and text) and paste it at the end. Replace or delete the examples before uploading.'),
    step('Save the file as a Word document (.docx) and upload it.'),

    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Good to know')] }),
    bullet([new TextRun('Everything above the first Heading 1 — this page — is ignored by the importer.')]),
    bullet([new TextRun('Pictures you paste into the text are uploaded to the media library automatically. JPG, PNG, GIF and WebP work best.')]),
    bullet([new TextRun('Posts whose title matches an example below are left unticked in the preview, so they aren\'t imported by accident.')]),
    bullet([new TextRun('Don\'t use Heading 1 inside a post — it would start a new post.')]),

    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Details table — what to enter')] }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: COL,
      rows: [
        headerRow('Field', 'What to enter'),
        ...FIELDS.map((f) => new TableRow({
          children: [
            cell([new Paragraph({ children: [new TextRun({ text: f.label, bold: true })] })], COL[0], 'EEF2F8'),
            cell([new Paragraph({ children: [new TextRun(f.hint)] })], COL[1]),
          ],
        })),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  const scheduledFor = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01 09:00`;

  const example1 = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(EXAMPLE_POSTS.welcome)] }),
    detailsTable({
      status: 'draft',
      categories: 'News',
      tags: 'announcement, website',
      excerpt: 'We have a fresh new look — here is what changed and what is coming next.',
      featured: 'yes',
      metaDescription: 'A tour of our redesigned website and the features you can use today.',
    }),
    p(''),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun('Thanks for stopping by! We have rebuilt the site from the ground up so it is '),
        new TextRun({ text: 'faster', bold: true }),
        new TextRun(', easier to read on your phone and simpler to find your way around. Read on for the highlights, or '),
        new ExternalHyperlink({ link: 'https://example.com/contact', children: [new TextRun({ text: 'tell us what you think', style: 'Hyperlink' })] }),
        new TextRun('.'),
      ],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('What is new')] }),
    bullet([new TextRun({ text: 'A cleaner design', bold: true }), new TextRun(' with bigger text and more space for pictures.')]),
    bullet([new TextRun({ text: 'Search', bold: true }), new TextRun(' that finds articles, events and pages in one place.')]),
    bullet([new TextRun({ text: 'Dark mode', bold: true }), new TextRun(' that follows your device settings.')]),
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Getting started')] }),
    step('Open the menu at the top of any page.', 'example'),
    step('Pick a topic you are interested in.', 'example'),
    step('Subscribe to get new posts by email.', 'example'),
    new Paragraph({
      spacing: { before: 120, after: 120 },
      indent: { left: 720 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: '2F5597', space: 8 } },
      children: [new TextRun({ text: '“The best way to predict the future is to create it.”', italics: true })],
    }),
  ];

  const example2 = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(EXAMPLE_POSTS.scheduled)] }),
    detailsTable({
      status: 'scheduled',
      publishDate: scheduledFor,
      categories: 'Events',
      tags: 'events, community',
      excerpt: 'Our pick of the events, workshops and meet-ups coming up soon.',
      featured: 'no',
    }),
    p(''),
    p('This post is scheduled: it is saved now and goes live automatically on the publish date in the table above.'),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('1. Open studio evenings')] }),
    p('Drop in, meet the team and see what we are working on. No booking needed.'),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('2. Beginner workshops')] }),
    p('Small groups, friendly hosts and everything you need provided.'),
  ];

  const doc = new Document({
    creator: siteName,
    title: 'Bulk post import template',
    description: 'Write posts here and upload them from the admin panel (Posts → Import).',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'example', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [...instructions, ...example1, ...example2],
    }],
  });

  return Packer.toBlob(doc);
}
