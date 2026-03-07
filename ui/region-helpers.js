// Region Parsing Helpers — shared constants and pure functions for text/byte/word regions
import { hex8, hex16 } from '../core/utils.js';

// Shared constants for region display
export const REGION_MAX_TEXT = 50;   // sjasmplus compatible
export const REGION_MAX_BYTES = 8;   // bytes per DB line
export const REGION_MAX_WORDS = 4;   // words per DW line

// Parse text region, returns {text, bytes, bit7Terminated, nextAddr}
export function parseTextRegion(memory, startAddr, endAddr, maxChars = REGION_MAX_TEXT) {
    let text = '';
    let bytes = [];
    let bit7Terminated = false;
    let addr = startAddr;

    while (addr <= endAddr && text.length < maxChars && addr <= 0xffff) {
        const byte = memory.read(addr);
        bytes.push(byte);

        const hasBit7 = (byte & 0x80) !== 0;
        const charByte = hasBit7 ? (byte & 0x7F) : byte;

        if (charByte >= 32 && charByte < 127 && charByte !== 34) {
            text += String.fromCharCode(charByte);
            if (hasBit7) {
                bit7Terminated = true;
                addr++;
                break;
            }
        } else if (charByte === 34) {
            text += '""'; // Escape quote
            if (hasBit7) {
                bit7Terminated = true;
                addr++;
                break;
            }
        } else if (byte === 0) {
            text += '\\0';
        } else if (byte === 10) {
            text += '\\n';
        } else if (byte === 13) {
            text += '\\r';
        } else {
            // Non-printable - stop here
            if (text.length === 0) {
                // Return single byte as non-text
                return { text: '', bytes: [byte], bit7Terminated: false, nextAddr: addr + 1, singleByte: true };
            }
            bytes.pop(); // Don't include this byte
            break;
        }
        addr++;
    }

    return { text, bytes, bit7Terminated, nextAddr: addr, singleByte: false };
}

// Parse byte region (DB), returns {byteStrs, bytes, nextAddr}
export function parseByteRegion(memory, startAddr, endAddr, maxBytes = REGION_MAX_BYTES) {
    let byteStrs = [];
    let bytes = [];
    let addr = startAddr;

    while (addr <= endAddr && byteStrs.length < maxBytes && addr <= 0xffff) {
        const byte = memory.read(addr);
        byteStrs.push(`$${hex8(byte)}`);
        bytes.push(byte);
        addr++;
    }

    return { byteStrs, bytes, nextAddr: addr };
}

// Parse word region (DW), returns {wordStrs, bytes, nextAddr}
export function parseWordRegion(memory, startAddr, endAddr, maxWords = REGION_MAX_WORDS) {
    let wordStrs = [];
    let bytes = [];
    let addr = startAddr;

    while (addr <= endAddr && wordStrs.length < maxWords && addr < 0xffff) {
        const lo = memory.read(addr);
        const hi = memory.read((addr + 1) & 0xffff);
        const word = lo | (hi << 8);
        wordStrs.push(`$${hex16(word)}`);
        bytes.push(lo, hi);
        addr += 2;
        if (addr > endAddr + 1) break;
    }

    return { wordStrs, bytes, nextAddr: addr };
}
