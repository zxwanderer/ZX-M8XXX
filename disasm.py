import sys, os

ROM = "C:/Backa/js-zx-emulator_20260116c_aquaplaned/js-zx-emulator/roms/scorpion.rom"

rom = open(ROM, 'rb').read()
b2 = rom[0x8000:0xC000]

def rb(a):
    return b2[a] if 0 <= a < 0x4000 else 0
def rw(a):
    return rb(a) | (rb(a+1) << 8)
def s8(v):
    return v - 256 if v >= 128 else v

R8 = ["B","C","D","E","H","L","(HL)","A"]
R16 = ["BC","DE","HL","SP"]
R16AF = ["BC","DE","HL","AF"]
CC = ["NZ","Z","NC","C","PO","PE","P","M"]
ALU = ["ADD A,","ADC A,","SUB ","SBC A,","AND ","XOR ","OR ","CP "]
ROT = ["RLC","RRC","RL","RR","SLA","SRA","SLL","SRL"]

def dis_cb(a):
    b=rb(a+1); op=(b>>6)&3; bit=(b>>3)&7; r=b&7
    if op==0: return (ROT[bit]+" "+R8[r], 2)
    return (["BIT","RES","SET"][op-1]+" %d,%s"%(bit,R8[r]), 2)

def dis_ed(a):
    b=rb(a+1)
    t={0x44:"NEG",0x45:"RETN",0x4D:"RETI",0x46:"IM 0",0x56:"IM 1",0x5E:"IM 2",
       0x47:"LD I,A",0x4F:"LD R,A",0x57:"LD A,I",0x5F:"LD A,R",0x67:"RRD",0x6F:"RLD",
       0xA0:"LDI",0xA1:"CPI",0xA2:"INI",0xA3:"OUTI",0xA8:"LDD",0xA9:"CPD",0xAA:"IND",0xAB:"OUTD",
       0xB0:"LDIR",0xB1:"CPIR",0xB2:"INIR",0xB3:"OTIR",0xB8:"LDDR",0xB9:"CPDR",0xBA:"INDR",0xBB:"OTDR"}
    if b in t: return (t[b],2)
    if (b&0xC7)==0x40: return ("IN %s,(C)"%(R8[(b>>3)&7] if (b>>3)&7!=6 else "F"),2)
    if (b&0xC7)==0x41: return ("OUT (C),%s"%(R8[(b>>3)&7] if (b>>3)&7!=6 else "0"),2)
    if (b&0xCF)==0x42: return ("SBC HL,%s"%R16[(b>>4)&3],2)
    if (b&0xCF)==0x4A: return ("ADC HL,%s"%R16[(b>>4)&3],2)
    if (b&0xCF)==0x43: return ("LD ($%04X),%s"%(rw(a+2),R16[(b>>4)&3]),4)
    if (b&0xCF)==0x4B: return ("LD %s,($%04X)"%(R16[(b>>4)&3],rw(a+2)),4)
    return ("DB $ED,$%02X"%b,2)

def dis_ixiy(a, xy):
    b1=rb(a+1)
    if b1==0xCB:
        d=s8(rb(a+2)); b3=rb(a+3); op=(b3>>6)&3; bit=(b3>>3)&7; r=b3&7
        ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
        if op==0: return (ROT[bit]+' '+ds+('' if r==6 else ','+R8[r]),4)
        nm=['BIT','RES','SET'][op-1]
        return ('%s %d,%s'%(nm,bit,ds)+('' if r==6 else ','+R8[r]),4)
    if b1==0x23: return ('INC '+xy,2)
    if b1==0x2B: return ('DEC '+xy,2)
    if b1==0xE5: return ('PUSH '+xy,2)
    if b1==0xE1: return ('POP '+xy,2)
    if b1==0xE3: return ('EX (SP),'+xy,2)
    if b1==0xE9: return ('JP ('+xy+')',2)
    if b1==0xF9: return ('LD SP,'+xy,2)
    if b1==0x21: return ('LD %s,$%04X'%(xy,rw(a+2)),4)
    if b1==0x22: return ('LD ($%04X),%s'%(rw(a+2),xy),4)
    if b1==0x2A: return ('LD %s,($%04X)'%(xy,rw(a+2)),4)
    if (b1&0xCF)==0x09: return ('ADD %s,%s'%(xy,['BC','DE',xy,'SP'][(b1>>4)&3]),2)
    if b1==0x36:
        d=s8(rb(a+2)); n=rb(a+3); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
        return ('LD %s,$%02X'%(ds,n),4)
    if (b1&0xC0)==0x40 and b1!=0x76:
        dst=(b1>>3)&7; src=b1&7
        if dst==6:
            d=s8(rb(a+2)); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return ('LD %s,%s'%(ds,R8[src]),3)
        if src==6:
            d=s8(rb(a+2)); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return ('LD %s,%s'%(R8[dst],ds),3)
        dn=(xy+'H' if dst==4 else xy+'L' if dst==5 else R8[dst])
        sn=(xy+'H' if src==4 else xy+'L' if src==5 else R8[src])
        return ('LD %s,%s'%(dn,sn),2)
    if (b1&0xC0)==0x80:
        op=(b1>>3)&7; src=b1&7
        if src==6:
            d=s8(rb(a+2)); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return (ALU[op]+ds,3)
        sn=(xy+'H' if src==4 else xy+'L' if src==5 else R8[src])
        return (ALU[op]+sn,2)
    if (b1&0xC7)==0x04:
        r=(b1>>3)&7
        if r==6:
            d=s8(rb(a+2)); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return ('INC '+ds,3)
        rn=(xy+'H' if r==4 else xy+'L' if r==5 else R8[r])
        return ('INC '+rn,2)
    if (b1&0xC7)==0x05:
        r=(b1>>3)&7
        if r==6:
            d=s8(rb(a+2)); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return ('DEC '+ds,3)
        rn=(xy+'H' if r==4 else xy+'L' if r==5 else R8[r])
        return ('DEC '+rn,2)
    if (b1&0xC7)==0x06:
        r=(b1>>3)&7
        if r==6:
            d=s8(rb(a+2)); n=rb(a+3); ds='(%s%+d)'%(xy,d) if d else '(%s)'%xy
            return ('LD %s,$%02X'%(ds,n),4)
        rn=(xy+'H' if r==4 else xy+'L' if r==5 else R8[r])
        return ('LD %s,$%02X'%(rn,rb(a+2)),3)
    return ('DB $%02X,$%02X'%(rb(a),b1),2)

def dis(a):
    b=rb(a)
    if b in (0xDD,0xFD): return dis_ixiy(a,'IX' if b==0xDD else 'IY')
    if b==0xCB: return dis_cb(a)
    if b==0xED: return dis_ed(a)
    if b==0x00: return ('NOP',1)
    if b==0x76: return ('HALT',1)
    if b==0xF3: return ('DI',1)
    if b==0xFB: return ('EI',1)
    if b==0x08: return ('EX AF,AF'+chr(39),1)
    if b==0xD9: return ('EXX',1)
    if b==0xEB: return ('EX DE,HL',1)
    if b==0xE3: return ('EX (SP),HL',1)
    if b==0x07: return ('RLCA',1)
    if b==0x0F: return ('RRCA',1)
    if b==0x17: return ('RLA',1)
    if b==0x1F: return ('RRA',1)
    if b==0x27: return ('DAA',1)
    if b==0x2F: return ('CPL',1)
    if b==0x37: return ('SCF',1)
    if b==0x3F: return ('CCF',1)
    if b==0xE9: return ('JP (HL)',1)
    if b==0xF9: return ('LD SP,HL',1)
    if b==0xC9: return ('RET',1)
    if b==0x10: d=s8(rb(a+1)); return ('DJNZ $%04X'%((a+2+d)&0xFFFF),2)
    if b==0x18: d=s8(rb(a+1)); return ('JR $%04X'%((a+2+d)&0xFFFF),2)
    if b in (0x20,0x28,0x30,0x38):
        cc=['NZ','Z','NC','C'][(b-0x20)>>3]; d=s8(rb(a+1))
        return ('JR %s,$%04X'%(cc,(a+2+d)&0xFFFF),2)
    if (b&0xCF)==0x01: return ('LD %s,$%04X'%(R16[(b>>4)&3],rw(a+1)),3)
    if (b&0xCF)==0x09: return ('ADD HL,%s'%R16[(b>>4)&3],1)
    if (b&0xCF)==0x03: return ('INC %s'%R16[(b>>4)&3],1)
    if (b&0xCF)==0x0B: return ('DEC %s'%R16[(b>>4)&3],1)
    if b==0x02: return ('LD (BC),A',1)
    if b==0x12: return ('LD (DE),A',1)
    if b==0x0A: return ('LD A,(BC)',1)
    if b==0x1A: return ('LD A,(DE)',1)
    if b==0x22: return ('LD ($%04X),HL'%rw(a+1),3)
    if b==0x2A: return ('LD HL,($%04X)'%rw(a+1),3)
    if b==0x32: return ('LD ($%04X),A'%rw(a+1),3)
    if b==0x3A: return ('LD A,($%04X)'%rw(a+1),3)
    if (b&0xC7)==0x04: return ('INC %s'%R8[(b>>3)&7],1)
    if (b&0xC7)==0x05: return ('DEC %s'%R8[(b>>3)&7],1)
    if (b&0xC7)==0x06: return ('LD %s,$%02X'%(R8[(b>>3)&7],rb(a+1)),2)
    if (b&0xC0)==0x40: return ('LD %s,%s'%(R8[(b>>3)&7],R8[b&7]),1)
    if (b&0xC0)==0x80: return (ALU[(b>>3)&7]+R8[b&7],1)
    if (b&0xC7)==0xC6: return (ALU[(b>>3)&7]+'$%02X'%rb(a+1),2)
    if (b&0xC7)==0xC0: return ('RET %s'%CC[(b>>3)&7],1)
    if b==0xC3: return ('JP $%04X'%rw(a+1),3)
    if (b&0xC7)==0xC2: return ('JP %s,$%04X'%(CC[(b>>3)&7],rw(a+1)),3)
    if b==0xCD: return ('CALL $%04X'%rw(a+1),3)
    if (b&0xC7)==0xC4: return ('CALL %s,$%04X'%(CC[(b>>3)&7],rw(a+1)),3)
    if (b&0xCF)==0xC5: return ('PUSH %s'%R16AF[(b>>4)&3],1)
    if (b&0xCF)==0xC1: return ('POP %s'%R16AF[(b>>4)&3],1)
    if (b&0xC7)==0xC7: return ('RST $%02X'%(b&0x38),1)
    if b==0xD3: return ('OUT ($%02X),A'%rb(a+1),2)
    if b==0xDB: return ('IN A,($%02X)'%rb(a+1),2)
    return ('DB $%02X'%b,1)

def hexdump(start, end, title):
    print()
    print('='*72)
    print('HEX DUMP: %s' % title)
    print('ROM2 $%04X-$%04X (file $%04X-$%04X)' % (start,end,start+0x8000,end+0x8000))
    print('='*72)
    a=start
    while a<=end:
        n=min(16,end-a+1); bts=[rb(a+i) for i in range(n)]
        h=' '.join('%02X'%x for x in bts)
        asc=''.join(chr(x) if 32<=x<127 else '.' for x in bts)
        print('  $%04X: %-48s  %s' % (a,h,asc))
        a+=16

def dr(start, end, title):
    print()
    print('='*72)
    print('DISASSEMBLY: %s' % title)
    print('='*72)
    a=start
    while a<=end:
        m,l=dis(a)
        raw=' '.join('%02X'%rb(a+i) for i in range(l))
        print('  $%04X: %-14s  %s' % (a,raw,m))
        a+=l

print('SCORPION ZS 256 - ROM BANK 2 ANALYSIS')
print('Service Monitor ROM, file offset $8000-$BFFF')
hexdump(0x0540,0x05D5,'$0540-$05D5 (sub_0564 region)')
dr(0x0540,0x05D5,'$0540-$05D5 (sub_0564 region)')
hexdump(0x0092,0x00B0,'$0092-$00B0 (IM 1 handler)')
dr(0x0092,0x00B0,'$0092-$00B0 (IM 1 handler)')
hexdump(0x054E,0x0563,'$054E-$0563 (error handler)')
dr(0x054E,0x0563,'$054E-$0563 (error handler)')
dr(0x0000,0x00B0,'$0000-$00B0 (full init)')

print()
print('='*72)
print('STACK ANALYSIS: sub_0564')
print('='*72)
print()
print('Entry: CALL $0564 at $007B pushes return address $007E')
print('SP at sub entry: $5BFD (stack top = $007E)')
print()
a=0x0564; depth=0
while a<=0x05D5:
    m,l=dis(a)
    raw=' '.join('%02X'%rb(a+i) for i in range(l))
    note=''
    if m.startswith('PUSH '): depth+=1; note='[PUSH: %d->%d]'%(depth-1,depth)
    elif m.startswith('POP '): depth-=1; note='[POP: %d->%d]'%(depth+1,depth)
    elif m.startswith('CALL ') and 'RET' not in m: depth+=1; note='[CALL: %d->%d]'%(depth-1,depth)
    elif m=='RET': depth-=1; note='[RET: %d->%d]'%(depth+1,depth)
    elif 'LDIR' in m: note='[A unchanged, BC=0]'
    elif m=='XOR A': note='[A=0]'
    print('  $%04X  %-14s  %-26s %s' % (a,raw,m,note))
    a+=l

print()
print('='*72)
print('ANSWERS')
print('='*72)
print()
print('Q1: After LDIR at $0598, A = 0. XOR A at $058C set A=0, LDIR does not modify A.')
print()
print('Q2: POP HL at $059A does NOT pop the CALL return address ($007E).')
print('    There IS a PUSH HL at $0590 that pushes $C069.')
print('    POP HL at $059A pops $C069.')
print('    The return address $007E remains on the stack undisturbed.')
print()
print('Q3: The verify loop checks RAM at $C069-$FFFF, not ROM at $007E.')
print('    Since the RAM was just zeroed, all bytes should be 0.')
print('    This is a RAM integrity test. Non-zero = defective RAM -> error at $054E.')
