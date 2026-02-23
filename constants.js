// ZX-M8XXX — Shared constants
// Hardware addresses, port masks, and format definitions used across the emulator.

// =============================================================================
// Memory layout
// =============================================================================

const PAGE_SIZE = 0x4000;       // 16384 bytes per RAM/ROM bank
const BANK_MASK = 0x3FFF;       // 16KB bank offset mask (addr & BANK_MASK)

// Screen memory (within bank 5, or bank 7 for shadow screen)
const SCREEN_BITMAP = 0x4000;   // Screen pixel data start (also slot 1 boundary)
const SCREEN_ATTR   = 0x5800;   // Attribute/color data start
const SCREEN_END    = 0x5AFF;   // Attribute data end (inclusive)
const SCREEN_SIZE   = 6912;     // Bitmap (6144) + attributes (768)

// =============================================================================
// Port addresses
// =============================================================================

const PORT_7FFD = 0x7FFD;  // 128K memory paging
const PORT_1FFD = 0x1FFD;  // +2A special paging / Scorpion extended paging
const PORT_EFF7 = 0xEFF7;  // Pentagon 1024 extended memory control

const PORT_AY_REG  = 0xFFFD;  // AY-3-8910 register select
const PORT_AY_DATA = 0xBFFD;  // AY-3-8910 register write

const PORT_ULAPLUS_DATA = 0xBF3B;  // ULAplus data port
const PORT_ULAPLUS_REG  = 0xFF3B;  // ULAplus register port

const PORT_FDC_MSR  = 0x2FFD;  // µPD765 Main Status Register (read)
const PORT_FDC_DATA = 0x3FFD;  // µPD765 Data Register (read/write)

// =============================================================================
// Port decode masks and patterns
// =============================================================================

// 128K/+2/Pentagon: (port & DECODE_128K_MASK) === 0
const DECODE_128K_MASK = 0x8002;

// +2A: (port & DECODE_PLUS2A_MASK) === DECODE_7FFD_PLUS2A for 7FFD
const DECODE_PLUS2A_MASK = 0xC002;
const DECODE_7FFD_PLUS2A = 0x4000;

// +2A/+3: (port & DECODE_PLUS2A_MASK2) === DECODE_1FFD_PLUS2A for 1FFD
const DECODE_PLUS2A_MASK2 = 0xF002;
const DECODE_1FFD_PLUS2A  = 0x1000;

// +3 FDC: (port & DECODE_PLUS2A_MASK2) === DECODE_FDC_MSR / DECODE_FDC_DATA
const DECODE_FDC_MSR  = 0x2000;
const DECODE_FDC_DATA = 0x3000;

// Pentagon 1024: (port & DECODE_P1024_MASK) === DECODE_P1024_VAL
const DECODE_P1024_MASK = 0xF008;
const DECODE_P1024_VAL  = 0xE000;

// AY: (port & DECODE_AY_MASK) === DECODE_AY_REG / DECODE_AY_DATA
const DECODE_AY_MASK = 0xC002;
const DECODE_AY_REG  = 0xC000;
const DECODE_AY_DATA = 0x8000;

// =============================================================================
// Port 0x7FFD bit masks
// =============================================================================

const P7FFD_RAM_MASK   = 0x07;  // Bits 0-2: RAM bank (0-7)
const P7FFD_SCREEN_BIT = 0x08;  // Bit 3: screen bank (0=bank 5, 1=bank 7)
const P7FFD_ROM_BIT    = 0x10;  // Bit 4: ROM bank select
const P7FFD_LOCK_BIT   = 0x20;  // Bit 5: paging disable (lock)
const P7FFD_P1024_EXT  = 0xC0;  // Bits 6-7: Pentagon 1024 bank bits 3-4

// =============================================================================
// Beta Disk WD1793 port addresses (active-low, bits 5-7 select register)
// =============================================================================

const PORT_WD_CMD    = 0x1F;   // Command/status register
const PORT_WD_TRACK  = 0x3F;   // Track register
const PORT_WD_SECTOR = 0x5F;   // Sector register
const PORT_WD_DATA   = 0x7F;   // Data register
const PORT_WD_SYS    = 0xFF;   // System register (active-high)

// =============================================================================
// SNA snapshot format
// =============================================================================

const SNA_HEADER_SIZE = 27;                                 // Register dump
const SNA_48K_RAM     = 3 * PAGE_SIZE;                      // 49152 bytes (0x4000-0xFFFF)
const SNA_48K_SIZE    = SNA_HEADER_SIZE + SNA_48K_RAM;      // 49179
const SNA_128K_EXT    = 4;                                  // PC (2) + port7FFD (1) + trdos (1)
const SNA_128K_MIN    = SNA_48K_SIZE + 2;                   // 49181 — minimum for 128K detection
const SNA_128K_SIZE   = SNA_48K_SIZE + SNA_128K_EXT + 5 * PAGE_SIZE;  // 131103
const SNA_P1024_SIZE  = SNA_48K_SIZE + SNA_128K_EXT + 6 * PAGE_SIZE;  // 147487
