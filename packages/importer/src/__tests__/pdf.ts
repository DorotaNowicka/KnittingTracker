/**
 * Minimal PDF writer for tests: pages with Helvetica text (WinAnsi, ASCII only), raster images
 * (greyscale, Flate) and stroked lines. Enough to build synthetic chart PDFs that pdf.js parses the
 * same way as real ones. Node only.
 */
import { deflateSync } from 'node:zlib';
import type { GrayImage } from '../raster/gray';

export type PdfOp =
  | {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly text: string;
    }
  | {
      readonly kind: 'image';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly img: GrayImage;
    }
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
    };

export interface PdfPage {
  readonly width: number;
  readonly height: number;
  /** Coordinates are top-left based (like the analyser's output); converted here. */
  readonly ops: readonly PdfOp[];
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function writePdf(pages: readonly PdfPage[]): Uint8Array {
  const objects: (string | Uint8Array)[] = [];
  const add = (o: string | Uint8Array) => {
    objects.push(o);
    return objects.length;
  };
  const font = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const pagesId = objects.length + 1;
  objects.push(''); // placeholder for the page tree
  const kids: number[] = [];
  for (const page of pages) {
    const xobjects: string[] = [];
    let content = '';
    for (const op of page.ops) {
      if (op.kind === 'text') {
        content += `BT /F1 ${op.size} Tf ${op.x} ${page.height - op.y} Td (${esc(op.text)}) Tj ET\n`;
      } else if (op.kind === 'line') {
        content += `${op.width} w ${op.x1} ${page.height - op.y1} m ${op.x2} ${page.height - op.y2} l S\n`;
      } else {
        const data = deflateSync(op.img.data);
        const head = `<< /Type /XObject /Subtype /Image /Width ${op.img.width} /Height ${op.img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`;
        const bytes = new Uint8Array(head.length + data.length + 10);
        bytes.set(new TextEncoder().encode(head));
        bytes.set(data, head.length);
        bytes.set(new TextEncoder().encode('\nendstream'), head.length + data.length);
        const id = add(bytes);
        const name = `Im${id}`;
        xobjects.push(`/${name} ${id} 0 R`);
        content += `q ${op.w} 0 0 ${op.h} ${op.x} ${page.height - op.y - op.h} cm /${name} Do Q\n`;
      }
    }
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${stream} 0 R /Resources << /Font << /F1 ${font} 0 R >> /XObject << ${xobjects.join(' ')} >> >> >>`,
      ),
    );
  }
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [enc.encode('%PDF-1.4\n')];
  const offsets: number[] = [];
  let pos = chunks[0]?.length ?? 0;
  objects.forEach((o, i) => {
    offsets.push(pos);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const body = typeof o === 'string' ? enc.encode(o) : o;
    const tail = enc.encode('\nendobj\n');
    chunks.push(head, body, tail);
    pos += head.length + body.length + tail.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(enc.encode(xref));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
