#!/usr/bin/env python3
"""Z80 Assembly Label Offset Calculator for AGD engine.

Handles 'simplified' pseudo-instructions that appear in the AGD ASM source.
"""

import re
import json
import sys

# Known EQU constants
CONSTANTS = {
    'windowtop': 0, 'windowlft': 0, 'windowhgt': 24, 'windowwid': 32,
    'numobj': 8, 'mapwid': 4,
    'simask': 248, 'shrapn': 63926, 'scadtb': 64256, 'map': 64768,
    'loopa': 23681, 'loopb': 23728, 'loopc': 23729,
    'platfm': 1, 'wall': 2, 'ladder': 3, 'fodder': 4, 'deadly': 5,
    'custom': 6, 'water': 7, 'colect': 8, 'numtyp': 9,
    'numspr': 12, 'tabsiz': 17, 'sprbuf': 204, 'nmesiz': 4,
    'x': 8, 'y': 9, 'pam1st': 5,
    'numshr': 55, 'shrsiz': 6,
}

REGS8 = {'a', 'b', 'c', 'd', 'e', 'h', 'l'}

def split_commas(s):
    """Split by commas respecting quoted strings."""
    parts = []
    current = []
    in_quote = False
    quote_char = ''
    for ch in s:
        if in_quote:
            current.append(ch)
            if ch == quote_char:
                in_quote = False
        elif ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            current.append(ch)
        elif ch == ',':
            parts.append(''.join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        parts.append(''.join(current).strip())
    return parts

def eval_expr(expr):
    """Evaluate a simple expression with known constants."""
    e = expr.strip().lower()
    for k, v in CONSTANTS.items():
        e = re.sub(r'\b' + k + r'\b', str(v), e)
    e = re.sub(r'\$([0-9a-fA-F]+)', lambda m: str(int(m.group(1), 16)), e)
    e = re.sub(r'0x([0-9a-fA-F]+)', lambda m: str(int(m.group(1), 16)), e)
    try:
        return int(eval(e))
    except:
        print(f"Cannot eval: {expr} -> {e}", file=sys.stderr)
        return 0

def count_defb(data):
    parts = split_commas(data)
    count = 0
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if (p.startswith("'") and p.endswith("'")) or (p.startswith('"') and p.endswith('"')):
            count += len(p) - 2
        else:
            count += 1
    return count

def count_defw(data):
    parts = split_commas(data)
    return len(parts) * 2

def is_reg8(s):
    return s.strip() in REGS8

def is_hl_indirect(s):
    return s.strip() == '(hl)'

def is_ixiy_indirect(s):
    s = s.strip()
    return bool(re.match(r'\((ix|iy)[+\-]', s))

def z80_size(m, line_num=0):
    """Return the size in bytes of a Z80 instruction mnemonic string."""
    m = m.strip()
    if not m:
        return 0

    # ========== SIMPLIFIED / PSEUDO INSTRUCTIONS ==========
    # These are marked as "simplified" in the source and represent
    # sequences that the AGD compiler generates differently.

    # LD HL,(IX+d) - simplified for LD L,(IX+d) + LD H,(IX+d+1) = 6 bytes
    if re.match(r'^ld hl,\((ix|iy)\+', m):
        print(f"  L{line_num}: SIMPLIFIED ld hl,(ix+d) -> 6 bytes: {m}", file=sys.stderr)
        return 6

    # LD B,(label) where label is NOT a register pair - simplified
    # Real Z80 has LD B,(HL) but NOT LD B,(addr). Exclude known register pairs.
    _known_indirect = {'hl', 'bc', 'de'}
    ldsynth = re.match(r'^ld ([bcde]),\(([a-z_]\w*)\)$', m)
    if ldsynth and ldsynth.group(2) not in _known_indirect and not ldsynth.group(2).startswith('ix') and not ldsynth.group(2).startswith('iy'):
        print(f"  L{line_num}: SIMPLIFIED ld reg,(addr) -> 2 bytes: {m}", file=sys.stderr)
        return 2

    # AND (label) where label is NOT hl - simplified for AND n with self-mod
    andsynth = re.match(r'^and \(([a-z_]\w*)\)$', m)
    if andsynth and andsynth.group(1) not in _known_indirect and not andsynth.group(1).startswith('ix') and not andsynth.group(1).startswith('iy'):
        print(f"  L{line_num}: SIMPLIFIED and (addr) -> 2 bytes: {m}", file=sys.stderr)
        return 2

    # ADD A,(label) where label is NOT hl/ix/iy - simplified
    addsynth = re.match(r'^add a,\(([a-z_]\w*)\)$', m)
    if addsynth and addsynth.group(1) not in _known_indirect and not addsynth.group(1).startswith('ix') and not addsynth.group(1).startswith('iy'):
        print(f"  L{line_num}: SIMPLIFIED add a,(addr) -> 2 bytes: {m}", file=sys.stderr)
        return 2

    # XOR (IX+d) - this IS a real instruction = 3 bytes (DD AE dd)
    # Already handled by the main parser below

    # ========== STANDARD Z80 INSTRUCTIONS ==========

    # Simple 1-byte instructions
    simple1 = {
        'nop', 'ret', 'ei', 'di', 'halt', 'exx', 'ccf', 'scf', 'cpl',
        'rra', 'rrca', 'rla', 'rlca', 'daa',
        'ex de,hl', "ex af,af'", 'ex (sp),hl',
        'jp (hl)', 'ld sp,hl',
    }
    if m in simple1:
        return 1

    # RET cc
    if re.match(r'^ret (nz|z|nc|c|po|pe|p|m)$', m):
        return 1

    # RST
    if m.startswith('rst '):
        return 1

    # PUSH/POP
    pm = re.match(r'^(push|pop) (\w+)$', m)
    if pm:
        reg = pm.group(2)
        if reg in ('af', 'bc', 'de', 'hl'):
            return 1
        if reg in ('ix', 'iy'):
            return 2

    # EX (SP),IX/IY
    if re.match(r'^ex \(sp\),(ix|iy)$', m):
        return 2

    # JP (IX)/(IY)
    if m in ('jp (ix)', 'jp (iy)'):
        return 2

    # NEG
    if m == 'neg':
        return 2

    # RETI, RETN
    if m in ('reti', 'retn'):
        return 2

    # IM
    if re.match(r'^im [012]$', m):
        return 2

    # LD A,I / LD A,R / LD I,A / LD R,A (ED prefix)
    if m in ('ld a,i', 'ld a,r', 'ld i,a', 'ld r,a'):
        return 2

    # RRD, RLD (ED prefix)
    if m in ('rrd', 'rld'):
        return 2

    # Block instructions (ED prefix)
    block_instrs = {
        'ldir', 'lddr', 'cpir', 'cpdr', 'inir', 'indr', 'otir', 'otdr',
        'ldi', 'ldd', 'cpi', 'cpd', 'ini', 'ind', 'outi', 'outd',
    }
    if m in block_instrs:
        return 2

    # INC/DEC
    idm = re.match(r'^(inc|dec) (.+)$', m)
    if idm:
        operand = idm.group(2).strip()
        if is_reg8(operand) or is_hl_indirect(operand):
            return 1
        if operand in ('bc', 'de', 'hl', 'sp'):
            return 1
        if operand in ('ix', 'iy'):
            return 2
        if is_ixiy_indirect(operand):
            return 3

    # ADD HL,rr
    if re.match(r'^add hl,(bc|de|hl|sp)$', m):
        return 1

    # ADC/SBC HL,rr (ED prefix)
    if re.match(r'^(adc|sbc) hl,(bc|de|hl|sp)$', m):
        return 2

    # ADD IX/IY,rr (DD/FD prefix)
    if re.match(r'^add (ix|iy),(bc|de|ix|iy|sp)$', m):
        return 2

    # CB prefix: BIT/SET/RES b,r
    cbm = re.match(r'^(bit|set|res) ([0-7]),(.+)$', m)
    if cbm:
        operand = cbm.group(3).strip()
        if is_reg8(operand) or is_hl_indirect(operand):
            return 2
        if is_ixiy_indirect(operand):
            return 4

    # CB prefix: rotate/shift
    rsm = re.match(r'^(rl|rr|rlc|rrc|sla|sra|srl|sll) (.+)$', m)
    if rsm:
        operand = rsm.group(2).strip()
        if is_reg8(operand) or is_hl_indirect(operand):
            return 2
        if is_ixiy_indirect(operand):
            return 4

    # JR / DJNZ
    if m.startswith('jr ') or m.startswith('djnz '):
        return 2

    # JP nn / JP cc,nn
    if m.startswith('jp '):
        return 3

    # CALL nn / CALL cc,nn
    if m.startswith('call '):
        return 3

    # IN
    inm = re.match(r'^in (\w+),\((.+)\)$', m)
    if inm:
        port = inm.group(2).strip()
        if port == 'c':
            return 2  # ED prefix
        return 2  # IN A,(n)

    # OUT
    outm = re.match(r'^out \((.+)\),(\w+)$', m)
    if outm:
        port = outm.group(1).strip()
        if port == 'c':
            return 2  # ED prefix
        return 2  # OUT (n),A

    # LD instructions
    ldm = re.match(r'^ld (.+),(.+)$', m)
    if ldm:
        dst = ldm.group(1).strip()
        src = ldm.group(2).strip()

        # LD r,r
        if is_reg8(dst) and is_reg8(src):
            return 1

        # LD r,(HL)
        if is_reg8(dst) and is_hl_indirect(src):
            return 1

        # LD (HL),r
        if is_hl_indirect(dst) and is_reg8(src):
            return 1

        # LD (HL),n
        if is_hl_indirect(dst):
            return 2

        # LD r,n (8-bit immediate)
        if is_reg8(dst) and not src.startswith('('):
            return 2

        # LD r,(IX+d) / LD r,(IY+d)
        if is_reg8(dst) and is_ixiy_indirect(src):
            return 3

        # LD (IX+d),r
        if is_ixiy_indirect(dst) and is_reg8(src):
            return 3

        # LD (IX+d),n
        if is_ixiy_indirect(dst):
            return 4

        # LD A,(BC) / LD A,(DE)
        if dst == 'a' and src in ('(bc)', '(de)'):
            return 1

        # LD (BC),A / LD (DE),A
        if dst in ('(bc)', '(de)') and src == 'a':
            return 1

        # LD SP,IX/IY
        if dst == 'sp' and src in ('ix', 'iy'):
            return 2

        # LD rr,nn (16-bit immediate) or LD rr,(nn)
        if dst in ('bc', 'de', 'hl', 'sp'):
            if src.startswith('('):
                if is_ixiy_indirect(src):
                    # LD HL,(IX+d) etc - shouldn't reach here normally
                    return 3
                if dst == 'hl':
                    return 3  # LD HL,(nn) non-ED form
                return 4  # ED prefix: LD BC/DE/SP,(nn)
            return 3  # LD rr,nn

        # LD IX/IY,nn or LD IX/IY,(nn)
        if dst in ('ix', 'iy'):
            return 4

        # LD (nn),reg
        if dst.startswith('(') and not is_hl_indirect(dst) and not is_ixiy_indirect(dst) and dst not in ('(bc)', '(de)'):
            if src == 'a':
                return 3
            if src == 'hl':
                return 3
            if src in ('bc', 'de', 'sp'):
                return 4  # ED prefix
            if src in ('ix', 'iy'):
                return 4

        # LD A,(nn)
        if dst == 'a' and src.startswith('(') and src not in ('(bc)', '(de)', '(hl)') and not is_ixiy_indirect(src):
            return 3

    # ALU operations: ADD/ADC/SUB/SBC/AND/OR/XOR/CP
    for op in ('add', 'adc', 'sub', 'sbc', 'and', 'or', 'xor', 'cp'):
        if m == op:
            # bare op shouldn't appear
            continue
        if m.startswith(op + ' ') or m.startswith(op + ','):
            rest = m[len(op):].strip()
            # Could be "a,X" or just "X"
            if rest.startswith('a,'):
                operand = rest[2:].strip()
            else:
                operand = rest

            if is_reg8(operand):
                return 1
            if is_hl_indirect(operand):
                return 1
            if is_ixiy_indirect(operand):
                return 3
            # immediate
            return 2

    print(f"UNKNOWN INSTRUCTION (L{line_num}): '{m}'", file=sys.stderr)
    return 0


def main():
    with open('signatures/agd_engine.asm', 'r') as f:
        lines = f.readlines()

    pc = 0
    labels = {}

    for i, raw_line in enumerate(lines):
        line_num = i + 1

        # Strip comment (respecting quoted strings)
        line = raw_line.rstrip('\n\r')
        code = ''
        in_quote = False
        quote_char = ''
        for j, ch in enumerate(line):
            if in_quote:
                code += ch
                if ch == quote_char:
                    in_quote = False
            elif ch in ("'", '"'):
                in_quote = True
                quote_char = ch
                code += ch
            elif ch == ';':
                break
            else:
                code += ch
        code = code.strip()

        if not code:
            continue

        # Handle ORG
        orgm = re.match(r'^\s*org\s+\$([0-9a-fA-F]+)', code, re.I)
        if orgm:
            pc = int(orgm.group(1), 16)
            continue

        # Handle EQU
        if re.search(r'\bequ\b', code, re.I):
            continue

        # Extract label
        label = None
        instruction = code

        lm = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*:', code)
        if lm:
            label = lm.group(1)
            instruction = code[lm.end():].strip()
        else:
            lm2 = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s+(defb|defw|defs|db|dw|ds)\s', code, re.I)
            if lm2:
                label = lm2.group(1)
                instruction = code[len(label):].strip()

        if label:
            labels[label] = pc

        # Process instruction
        if not instruction:
            continue

        inst_lower = instruction.lower().strip()

        # Data directives
        dm = re.match(r'^(defb|db)\s+(.*)', inst_lower, re.I)
        if dm:
            size = count_defb(dm.group(2))
            pc += size
            continue

        dm = re.match(r'^(defw|dw)\s+(.*)', inst_lower, re.I)
        if dm:
            size = count_defw(dm.group(2))
            pc += size
            continue

        dm = re.match(r'^(defs|ds)\s+(.*)', inst_lower, re.I)
        if dm:
            parts = split_commas(dm.group(2))
            size = eval_expr(parts[0])
            pc += size
            continue

        # Regular instruction
        size = z80_size(inst_lower, line_num)
        pc += size

    # Build result sorted by address, handling duplicates
    addr_to_labels = {}
    for name, addr in labels.items():
        hex_addr = format(addr, 'x')
        if hex_addr not in addr_to_labels:
            addr_to_labels[hex_addr] = []
        addr_to_labels[hex_addr].append(name)

    result = {}
    for hex_addr in sorted(addr_to_labels.keys(), key=lambda x: int(x, 16)):
        names = addr_to_labels[hex_addr]
        if len(names) == 1:
            result[hex_addr] = names[0]
        else:
            result[hex_addr] = '/'.join(names)

    print(json.dumps(result, indent=2))
    print(f"\n// Total unique addresses: {len(result)}", file=sys.stderr)
    print(f"// Total labels: {sum(len(v.split('/')) for v in result.values())}", file=sys.stderr)
    print(f"// End address: ${pc:04X}", file=sys.stderr)


if __name__ == '__main__':
    main()
