/**
 * Utility to write fields into a fixed-width BOE buffer.
 * BOE format uses ISO-8859-1 encoded text with fixed-width fields at specific positions.
 */

export class BoeBuffer {
  private buf: Buffer;
  private length: number;

  constructor(length: number) {
    this.length = length;
    // Initialize with spaces (0x20)
    this.buf = Buffer.alloc(length, 0x20);
  }

  /**
   * Write a field at 1-based position.
   * @param pos 1-based position (as per BOE spec)
   * @param len field length
   * @param value value to write
   * @param type "A" alphanumeric (uppercase, left-aligned, space-padded)
   *             "An" alphanumeric (left-aligned, space-padded)
   *             "Num" numeric (right-aligned, zero-padded)
   *             "N" signed numeric (amount, right-aligned, zero-padded, last char = sign)
   */
  write(pos: number, len: number, value: string | number, type: "A" | "An" | "Num" | "N") {
    const start = pos - 1;
    if (start + len > this.length) {
      throw new Error(`Field at pos=${pos}, len=${len} exceeds buffer length ${this.length}`);
    }

    let str: string;

    if (type === "N") {
      // Signed numeric: value is in cents, last char is sign (last digit + sign)
      // Format: right-aligned zeros, last position is the sign digit encoded
      // AEAT convention: the last position contains the sign by encoding last digit
      // Actually simpler: the amount is stored as integer cents, right-aligned, zero-padded
      // Sign: if positive, no sign; if negative, last char is encoded differently
      // For now, simple positive handling (wealth tax amounts are positive)
      const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      const cents = Math.round(Math.abs(num) * 100);
      const digits = cents.toString().padStart(len, "0");
      if (digits.length > len) {
        throw new Error(`Numeric value ${num} exceeds field length ${len} at pos=${pos}`);
      }
      // Sign indicator: last char. For positive: use normal digit. For negative: encode.
      // Simplification: only support positive for now
      if (num < 0) {
        throw new Error(`Negative numbers in N fields not yet supported at pos=${pos}`);
      }
      str = digits;
    } else if (type === "Num") {
      // Plain numeric: right-aligned, zero-padded
      const num = typeof value === "number" ? value : value.toString();
      str = num.toString().padStart(len, "0");
      if (str.length > len) {
        throw new Error(`Numeric value ${value} exceeds field length ${len} at pos=${pos}`);
      }
    } else if (type === "A") {
      // Alphabetic: uppercase, left-aligned, space-padded
      str = (value.toString().toUpperCase() + " ".repeat(len)).substring(0, len);
    } else {
      // An: Alphanumeric, left-aligned, space-padded
      str = (value.toString() + " ".repeat(len)).substring(0, len);
    }

    // Write using latin1 encoding to match AEAT's ISO-8859-1
    const bytes = Buffer.from(str, "latin1");
    bytes.copy(this.buf, start, 0, Math.min(len, bytes.length));
  }

  /**
   * Write a constant string at 1-based position.
   */
  writeConstant(pos: number, value: string) {
    const start = pos - 1;
    const bytes = Buffer.from(value, "latin1");
    if (start + bytes.length > this.length) {
      throw new Error(`Constant "${value}" at pos=${pos} exceeds buffer`);
    }
    bytes.copy(this.buf, start);
  }

  toBuffer(): Buffer {
    return this.buf;
  }

  toString(): string {
    return this.buf.toString("latin1");
  }
}

/**
 * Normalizes accented characters for AEAT's expected format.
 * ISO-8859-1 supports most Spanish accents directly.
 */
export function normalizeString(s: string): string {
  // Remove unsupported characters, keep accents
  return s
    .normalize("NFC")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "") // Keep printable ASCII + Latin-1 supplement
    .toUpperCase();
}
