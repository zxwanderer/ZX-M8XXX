; AGD (Arcade Game Designer) Engine v0.7.10
; (C) 2008-2020 Jonathan Cauldwell
; ZX Spectrum Engine - signature pack source
;
; This file wraps EngineZX.asm with stub definitions for
; compiler-generated externals so it can be parsed for label extraction.
; Typical AGD game: CLEAR 31106: LOAD ""CODE: RANDOMIZE USR 32000

; Compiler-defined window constants (typical values)
WINDOWTOP equ 0
WINDOWLFT equ 0
WINDOWHGT equ 24
WINDOWWID equ 32
NUMOBJ equ 8
MAPWID equ 4

; The engine is placed by the AGD compiler after game data.
; A typical ORG for the engine start is around $6100-$7D00 depending on
; game data size. We use $6100 as a representative base address.
        org $6100

; Global definitions.

; Arcade Game Designer.
; (C) 2008 - 2020 Jonathan Cauldwell.
; ZX Spectrum Engine v0.7.10

SIMASK equ 248             ; SPRITEINK mask
SHRAPN equ 63926           ; shrapnel table
SCADTB equ 64256           ; screen address table
MAP    equ 64768           ; properties map buffer
loopa  equ 23681           ; loop counter system variable
loopb  equ 23728           ; loop counter system variable
loopc  equ 23729           ; loop counter system variable

; Block characteristics.
PLATFM equ 1
WALL   equ 2
LADDER equ 3
FODDER equ 4
DEADLY equ 5
CUSTOM equ 6
WATER  equ 7
COLECT equ 8
NUMTYP equ 9

; Sprites.
NUMSPR equ 12
TABSIZ equ 17
SPRBUF equ 204
NMESIZ equ 4
X      equ 8
Y      equ 9
PAM1ST equ 5

; Particle engine.
NUMSHR equ 55
SHRSIZ equ 6

; === ENGINE CODE START ===

start:
; Set up the font.
       ld hl,font-256
       ld (23606),hl
       jp gamelp

joyval defb 0              ; joystick reading
frmno  defb 0              ; selected frame

wintop defb WINDOWTOP
winlft defb WINDOWLFT
winhgt defb WINDOWHGT
winwid defb WINDOWWID

numob  defb NUMOBJ

; Variables
wntopx defb (8 * WINDOWTOP)
wnlftx defb (8 * WINDOWLFT)
wnbotx defb ((WINDOWTOP * 8) + (WINDOWHGT * 8) - 16)
wnrgtx defb ((WINDOWLFT * 8) + (WINDOWWID * 8) - 16)
scno   defb 0              ; present screen number
numlif defb 3              ; number of lives
vara   defb 0              ; variable A
varb   defb 0              ; variable B
varc   defb 0              ; variable C
vard   defb 0              ; variable D
vare   defb 0              ; variable E
varf   defb 0              ; variable F
varg   defb 0              ; variable G
varh   defb 0              ; variable H
vari   defb 0              ; variable I
varj   defb 0              ; variable J
vark   defb 0              ; variable K
varl   defb 0              ; variable L
varm   defb 0              ; variable M
varn   defb 0              ; variable N
varo   defb 0              ; variable O
varp   defb 0              ; variable P
varq   defb 0              ; variable Q
varr   defb 0              ; variable R
vars   defb 0              ; variable S
vart   defb 0              ; variable T
varu   defb 0              ; variable U
varv   defb 0              ; variable V
varw   defb 0              ; variable W
varz   defb 0              ; variable Z
contrl defb 0              ; control mode
charx  defb 0              ; cursor x
chary  defb 0              ; cursor y
clock  defb 0              ; last clock reading
varrnd defb 255            ; last random number
varobj defb 254            ; last object number
varopt defb 255            ; last option chosen
varblk defb 255            ; block type
nexlev defb 0              ; next level flag
restfl defb 0              ; restart screen flag
deadf  defb 0              ; dead flag
gamwon defb 0              ; game won flag
dispx  defb 0              ; display x position
dispy  defb 0              ; display y position

; Data pointers (to compiler-generated data)
frmptr defw frmlst
blkptr defw chgfx
colptr defw bcol
proptr defw bprop
scrptr defw scdat
nmeptr defw nmedat

; --- Menu/inventory routines ---

minve:
       ld hl,invdis
       ld (mod0+1),hl
       ld (mod2+1),hl
       ld hl,fopt
       ld (mod1+1),hl
       jr dbox

mmenu:
       ld hl,always
       ld (mod0+1),hl
       ld (mod2+1),hl
       ld hl,fstd
       ld (mod1+1),hl

dbox:
       ld hl,msgdat
       call getwrd
       push hl
       ld d,1
       xor a
       ld (combyt),a
       ld e,a
dbox5: ld b,0
mod2:  call always
       jr nz,dbox6
       inc d
dbox6: ld a,(hl)
       inc hl
       cp ','
       jr z,dbox3
       cp 13
       jr z,dbox3
       inc b
       and a
       jp m,dbox4
       jr dbox6
dbox3: ld a,e
       cp b
       jr nc,dbox5
       ld e,b
       jr dbox5
dbox4: ld a,e
       cp b
       jr nc,dbox8
       ld e,b
dbox8: dec d
       jp z,dbox15
       ld a,e
       and a
       jp z,dbox15
       ld (bwid),de
       ld a,(winhgt)
       sub d
       rra
       ld hl,wintop
       add a,(hl)
       ld (btop),a
       ld a,(winwid)
       sub e
       rra
       inc hl
       add a,(hl)
       ld (blft),a
       ld hl,(23606)
       ld (grbase),hl
       pop hl
       ld a,(btop)
       ld (dispx),a
       xor a
       ld (combyt),a
dbox2: ld a,(combyt)
mod0:  call always
       jp nz,dbox13
       ld a,(blft)
       ld (dispy),a
       ld a,(bwid)
       ld b,a
dbox0: ld a,(hl)
       cp ','
       jr z,dbox1
       cp 13
       jr z,dbox1
       dec b
       and 127
       push bc
       push hl
       push af
       call gaadd
       ld a,(23693)
       ld (hl),a
       pop af
       call pchr
       pop hl
       pop bc
       ld a,(hl)
       inc hl
       cp 128
       jp nc,dbox7
       ld a,b
       and a
       jr nz,dbox0
dbox9: ld a,(hl)
       inc hl
       cp ','
       jr z,dbox10
       cp 13
       jr z,dbox10
       cp 128
       jr nc,dbox11
       jr dbox9
dboxf: push hl
       push bc
       call gaadd
       ld a,(23693)
       ld (hl),a
       ld a,32
       call pchr
       pop bc
       pop hl
       djnz dboxf
       ret
dbox1: inc hl
       call dboxf
dbox10:
       ld a,(dispx)
       inc a
       ld (dispx),a
       jp dbox2
dbox7: ld a,b
       and a
       jr z,dbox11
       call dboxf
dbox11:
       ld a,(btop)
       ld (dispx),a
dbox14:
       call joykey
       and 31
       jr nz,dbox14
       call dbar
dbox12:
       call joykey
       and 28
       jr z,dbox12
       and 16
mod1:  jp nz,fstd
       call dbar
       ld a,(joyval)
       and 8
       jr nz,dboxu
       ld a,(dispx)
       inc a
       ld hl,btop
       sub (hl)
       dec hl
       cp (hl)
       jp z,dbox14
       ld hl,dispx
       inc (hl)
       jr dbox14
dboxu: ld a,(dispx)
       ld hl,btop
       cp (hl)
       jp z,dbox14
       ld hl,dispx
       dec (hl)
       jr dbox14
fstd:  ld a,(dispx)
       ld hl,btop
       sub (hl)
       ld (varopt),a
       jp redraw
dbox13:
       ld a,(hl)
       inc hl
       cp ','
       jp z,dbox2
       cp 13
       jp z,dbox2
       and a
       jp m,dbox11
       jr dbox13
dbox15:
       pop hl
       ret

dbar:  ld a,(blft)
       ld (dispy),a
       call gprad
       ex de,hl
       ld a,(bwid)
       ld c,a
       ld d,h
dbar1: ld b,8
dbar0: ld a,(hl)
       cpl
       ld (hl),a
       inc h
       djnz dbar0
       ld h,d
       inc l
       dec c
       jr nz,dbar1
       ret

invdis:
       push hl
       push de
       ld hl,combyt
       ld a,(hl)
       inc (hl)
       call gotob
       pop de
       pop hl
       ret

fopt:  ld a,(dispx)
       ld hl,btop
       sub (hl)
       inc a
       ld b,a
       ld hl,combyt
       ld (hl),0
fopt0: push bc
       call fobj
       pop bc
       djnz fopt0
       ld a,(combyt)
       dec a
       ld (varopt),a
       jp redraw

fobj:  ld hl,combyt
       ld a,(hl)
       inc (hl)
       ret z
       call gotob
       ret z
       jr fobj

bwid   defb 0
blen   defb 0
btop   defb 0
blft   defb 0

; --- Wait/debounce ---

prskey:
       call debkey
prsky0:
       call vsync
       call 654
       inc e
       jr z,prsky0

debkey:
       call vsync
       call 654
       inc e
       jr nz,debkey
       ret

; --- Delay ---

delay: push bc
       call vsync
       pop bc
       djnz delay
       ret

; --- Clear sprite table ---

xspr:  ld hl,sprtab
       ld b,SPRBUF
xspr0: ld (hl),255
       inc hl
       djnz xspr0
       ret

; --- Initialise objects ---

iniob: ld ix,objdta
       ld a,(numob)
       ld b,a
       ld de,39
iniob0:
       ld a,(ix+36)
       ld (ix+33),a
       ld a,(ix+37)
       ld (ix+34),a
       ld a,(ix+38)
       ld (ix+35),a
       add ix,de
       djnz iniob0
       ret

; --- Screen synchronisation ---

vsync: call joykey
       ld a,(sndtyp)
       and a
       jp z,vsync1
       ld b,a
       ld a,(23624)
       rra
       rra
       rra
       ld c,a
       ld a,b
       and a
       jp m,vsync6
vsync2:
       ld a,c
       out (254),a
       xor 248
       ld c,a
       ld d,b
vsync3:
       ld hl,clock
       ld a,(23672)
       cp (hl)
       jp nz,vsync4
       djnz vsync3
       ld b,d
       djnz vsync2
vsync4:
       ld a,d
vsynca:
       ld (sndtyp),a
vsync1:
       ld a,(23672)
       rra
       call c,vsync5
       ld hl,clock
vsync0:
       ld a,(23672)
       cp (hl)
       jr z,vsync0
       ld (hl),a
       ret
vsync5:
       call plsnd
       jp proshr
vsync6:
       ld a,b
       sub 127
       ld b,a
       ld hl,clock
vsync7:
       ld a,r
       and 248
       or c
       out (254),a
       ld a,(23672)
       cp (hl)
       jp nz,vsync8
       ld a,b
       and 127
       inc a
vsync9:
       dec a
       jr nz,vsync9
       djnz vsync7
vsync8:
       xor a
       jr vsynca
sndtyp defb 0

; --- Redraw screen ---

redraw:
       push ix
       call droom
       call shwob
numsp0:
       ld b,NUMSPR
       ld ix,sprtab
redrw0:
       ld a,(ix+0)
       inc a
       jr z,redrw1
       ld a,(ix+3)
       cp 177
       jr nc,redrw1
       push bc
       call sspria
       pop bc
redrw1:
       ld de,TABSIZ
       add ix,de
       djnz redrw0
       call rbloc
       call dshrp
       pop ix
       ret

; --- Clear screen ---

cls:   ld hl,16384
       ld (hl),l
       ld de,16385
       ld bc,6144
       ldir
       ld a,(23693)
       ld (hl),a
       ld bc,767
       ldir
       ld hl,0
       ld (charx),hl
       ret

; --- ULAplus palette ---

setpal:
       ld bc,48955
       ld a,64
       out (c),a
       ld b,255
       ld a,1
       out (c),a
       ld b,64
setpa1:
       ld hl,palett
       ld e,0
setpa0:
       push bc
       ld b,191
       ld a,e
       out (c),a
       ld b,255
       ld a,(hl)
       out (c),a
       inc e
       inc hl
       pop bc
       djnz setpa0
       ret

endpal:

; --- Fodder block check ---

fdchk: ld a,(hl)
       cp FODDER
       ret nz
       ld (hl),0
       push hl
       ld de,MAP
       and a
       sbc hl,de
       ld a,l
       and 31
       ld (dispy),a
       add hl,hl
       add hl,hl
       add hl,hl
       ld a,h
       ld (dispx),a
       ld hl,(blkptr)
       ld (grbase),hl
       xor a
       call pattr
       pop hl
       ret

; --- Colour a sprite ---

cspr:
       ld a,(ix+8)
       cp 177
       ret nc
       rlca
       rlca
       ld l,a
       and 3
       add a,88
       ld h,a
       ld a,l
       and 224
       ld l,a
       ld a,(ix+9)
       rra
       rra
       rra
       and 31
       add a,l
       ld l,a
       ld de,30
       push hl
       exx
       pop hl
       ld de,MAP-22528
       add hl,de
       ld de,30
       ld a,(ix+8)
cspr2: ld b,3
       and 7
       jr nz,cspr0
       dec b
cspr0: ld a,(hl)
       and a
       jr nz,cspr6
       exx
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
       exx
cspr6: inc l
       exx
       inc l
       exx
       ld a,(hl)
       and a
       jr nz,cspr7
       exx
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
       exx
cspr7: inc l
       exx
       inc l
       exx
       ld a,(ix+9)
       and 7
       jr z,cspr1
       ld a,(hl)
       and a
       jr nz,cspr1
       exx
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
       exx
cspr1: add hl,de
       exx
       add hl,de
       exx
       djnz cspr0
       ret

; --- Scrolly text variables ---

txtbit defb 128
txtwid defb 0
txtpos defw msgdat
txtini defw msgdat
txtscr defw 0

; --- Particle engine ---

proshr:
       ld ix,SHRAPN
       ld b,NUMSHR
prosh0:
       push bc
       ld a,(ix+0)
       and a
       jr z,prosh1
proshx:
       call shrap
prosh1:
       ld de,SHRSIZ
       add ix,de
       pop bc
       djnz prosh0
       call scrly
       ret

; Shrapnel routine pointer table
shrptr:
       defw shrap
       defw trail
       defw laser
       defw dotl
       defw dotr
       defw dotu
       defw dotd
       defw ptusr

; Shrapnel movement
shrap: ld a,(ix+5)
       dec a
       ld (ix+5),a
       jr z,kilshr
       ld a,(ix+1)
       ld l,a
       ld h,0
       add hl,hl
       ld de,shrsin
       add hl,de
       ld e,(hl)
       inc hl
       ld d,(hl)
       ld a,(ix+2)
       ld l,a
       ld h,0
       call imul
       ld a,h
       add a,(ix+3)
       ld (ix+3),a
       ld a,(ix+1)
       add a,8
       and 31
       ld l,a
       ld h,0
       add hl,hl
       ld de,shrsin
       add hl,de
       ld e,(hl)
       inc hl
       ld d,(hl)
       ld a,(ix+2)
       ld l,a
       ld h,0
       call imul
       ld a,h
       add a,(ix+4)
       ld (ix+4),a
       jp chkxy

dotl:  dec (ix+3)
       jp chkxy
dotr:  inc (ix+3)
       jp chkxy
dotu:  dec (ix+4)
       jp chkxy
dotd:  inc (ix+4)
       jp chkxy

; Check particle coordinates
chkxy: ld a,(ix+3)
       cp (ix+7)  ; wnlftx check
       jr c,kilshr
       ld a,(ix+4)
       cp (ix+6)  ; wntopx check
       jr c,kilshr
       call plot
       ret

; Plot shrapnel pixel
plot:  ld a,(ix+4)
       ld d,a
       ld a,(ix+3)
       ld e,a
       ld b,a
       and 7
       ld hl,dots
       add a,l
       ld l,a
       ld a,(hl)
       ld c,a
       ld a,d
       and a
       jp m,kilshr
       call scadd
       ld a,(hl)
       xor c
       ld (hl),a
       ret

kilshr:
       ld (ix+0),0
       ret

; Shrapnel sine table
shrsin:
       defw 0,1024,391,946,724,724,946,391
       defw 1024,0,391,946,724,724,946,391
       defw 0,65512,65145,65590,64812,64812,65590,65145
       defw 65512,0,65145,65590,64812,64812,65590,65145

; Pixel position table
dots:  defb 128,64,32,16,8,4,2,1

; Trail particle
trail: ld a,(ix+5)
       dec a
       ld (ix+5),a
       jr z,kilshr
       ld a,(ix+1)
       and a
       jr z,traill
       inc (ix+3)
       jr trailv
traill:
       dec (ix+3)
trailv:
       ld a,(ix+2)
       and a
       jr z,trailu
       inc (ix+4)
       jp chkxy
trailu:
       dec (ix+4)
       jp chkxy

; Laser particle
laser: ld a,(ix+1)
       and a
       jr z,laserl
       inc (ix+3)
       inc (ix+3)
       jp chkxy
laserl:
       dec (ix+3)
       dec (ix+3)
       jp chkxy

; Plot preserving DE
plotde:
       push de
       call plot
       pop de
       ret

; Shoot laser
shoot: push ix
       ld a,(ix+9)
       add a,4
       ld d,a
shoot1:
       ld a,(ix+3)
       and 248
       add a,4
       ld e,a
       ld a,(ix+10)
       and a
       jr z,shootr
       ld a,e
       sub 8
       ld e,a
shoot0:
       call fpslot
       jr shootr
shootr:
       pop ix
       ret

; Vapour trail
vapour:
       push ix
       ld a,(ix+9)
       add a,4
vapou3:
       ld d,a
vapou2:
       pop ix
       ret
vapou1:
       ld a,(ix+3)
       add a,4
       ld e,a
vapou0:
       call plotde
       ret

; User particle
ptusr: ld a,(ix+5)
       dec a
       ld (ix+5),a
       jr z,kilshr
ptusr1:
       ld a,(ix+1)
       add a,(ix+3)
       ld (ix+3),a
       ld a,(ix+2)
       add a,(ix+4)
       ld (ix+4),a
       jp chkxy

; Starfield particle
star:  push ix
       ld a,(ix+5)
       dec a
       ld (ix+5),a
       jr z,star0
star7: ld a,(ix+0)
       ld hl,shrptr
       add a,a
       add a,l
       ld l,a
       ld a,(hl)
       inc hl
       ld h,(hl)
       ld l,a
       jp (hl)
star0: pop ix
       ret
star8: ld a,(wntopx)
       add a,8
       ld (ix+4),a
star9: ld a,8
       ld (ix+5),a
       call qrand
       ret
star1: ld a,(wnrgtx)
       ld (ix+3),a
       jr star9
star2: ld a,(wnlftx)
       ld (ix+3),a
       jr star9
star3: ld a,(wnbotx)
       ld (ix+4),a
       jr star9

; Find free particle slot
fpslot:
       ld ix,SHRAPN
       ld b,NUMSHR
fpslt0:
       ld a,(ix+0)
       and a
       ret z
       ld de,SHRSIZ
       add ix,de
       djnz fpslt0
       ret

; Create explosion
explod:
       push ix
       ld ix,SHRAPN
       ld b,NUMSHR
expld0:
       ld a,(ix+0)
       and a
       jr nz,expld2
expld1:
       ld (ix+0),1
       pop de
       push de
       ld a,(de)
       ld (ix+3),a
       inc de
       ld a,(de)
       ld (ix+4),a
       inc de
       call qrand
       and 31
       ld (ix+1),a
       call qrand
       ld (ix+2),a
       ld (ix+5),16
expld2:
       ld de,SHRSIZ
       add ix,de
       djnz expld0
expld3:
       pop ix
       ret

; Quick random number
qrand: ld a,(seed3)
       ld b,a
       add a,a
       add a,a
       add a,b
       inc a
       ld (seed3),a
       ret
seed3  defb 0

; Display all shrapnel
dshrp: ld ix,SHRAPN
       ld b,NUMSHR
dshrp0:
       push bc
       ld a,(ix+0)
       and a
       call nz,plot
       ld de,SHRSIZ
       add ix,de
       pop bc
       djnz dshrp0
       ret

; Initialise particle engine
inishr:
       ld ix,SHRAPN
       ld b,NUMSHR*SHRSIZ
inish0:
       ld (ix+0),0
       inc ix
       djnz inish0
       ret

; Laser-sprite collision check
lcol:  ld iy,SHRAPN
       ld b,NUMSHR
lcol0: ld a,(iy+0)
       cp 3
       jr nz,lcol3
       ld a,(iy+3)
       sub (ix+8)
       jr c,lcol3
       cp 16
       jr nc,lcol3
lcol3: ld de,SHRSIZ
       add iy,de
       djnz lcol0
       ret
lcolh: ld a,(iy+4)
       sub (ix+9)
       jr c,lcol2
       cp 16
       jr nc,lcol2
lcol4: ld (iy+0),0
       scf
       ret
lcol2: and a
       ret

; === MAIN GAME LOOP ===

gamelp:
       call game
       jr gamelp

game:
setsat:
       ld hl,16384
       ld de,SCADTB
       ld b,192
setsa0:
       ld (de),a
       inc de
       ld a,l
       ld (de),a
       inc de
       call nline
       djnz setsa0
rpblc2:
       call inishr
evintr:
       call evnt12
       call cls
mapst: ld a,0
       ld (scno),a
inipbl:
       call iniob
evini: call evnt13
rstrt: call rsevt
       call xspr
       call ispr
       jp rstrt0
rstrtn:
       call rsevt
       call nspr
       call kspr
rstrt0:
       xor a
       ld (nexlev),a
       ld (restfl),a
       ld (deadf),a
       ld (gamwon),a
       call clw
       call droom
       call shwob
       call redraw

; Main loop
mloop: call vsync
       ld b,NUMSPR/2
       ld ix,sprtab
       call dspr
       ld b,NUMSPR/2
       call dspr
evlp1: call evnt10
       call pspr
evlp2: call evnt11
bsortx:
       call bsort
       call getcol
       ld a,(nexlev)
       and a
       jr nz,newlev
       ld a,(deadf)
       and a
       jr nz,pdead
       ld a,(gamwon)
       and a
       jr nz,evwon
       ld a,(restfl)
       and a
       jr nz,rstrt
       jp mloop

newlev:
       ld a,(scno)
       inc a
       ld (scno),a
       jp rstrtn

evwon: call evnt18
       jr tidyup

pdead: xor a
       ld (deadf),a
evdie: call evnt16
       ld a,(numlif)
       and a
       jp nz,rstrtn
evfail:
       call evnt17

tidyup:
       ld hl,hiscor
       ld de,score
       ld b,6
tidyu2:
       ld a,(de)
       cp (hl)
       jr c,tidyu0
       jr nz,tidyu1
       inc hl
       inc de
       djnz tidyu2
tidyu0:
       ret
tidyu1:
       ld hl,score
       ld de,hiscor
       ld bc,6
       ldir
evnewh:
       call evnt19
       ret

; Restart event
rsevt:
evrs:  jp evnt14

; --- Number conversion ---

num2ch:
       ld c,' '
       ld de,displ0
       ld b,100
numdg3:
       call numdg
       ld b,10
numdg2:
       call numdg
       add a,'0'
       ld (de),a
       inc de
       xor a
       ld (de),a
       ret
numdg: ld (hl),c
numdg1:
       sub b
       jr c,numdg0
       inc (hl)
       jr numdg1
numdg0:
       add a,b
       ld c,'0'
       ret

num2dd:
       ld de,displ0
       ld b,10
       jr numdg2

num2td:
       ld c,'0'
       ld de,displ0
       ld b,100
       jr numdg3

; --- Initialise score ---

inisc: ld hl,score
       ld b,6
inisc0:
       ld (hl),'0'
       inc hl
       djnz inisc0
       ret

; --- Multiply ---

imul:  ld e,0
       ld l,e
imul0: ld a,l
       add a,l
       ld l,a
       ld a,e
       adc a,e
       ld e,a
imul1: sla d
       jr nc,imul2
       ld a,l
       add a,h
       ld l,a
       ld a,e
       adc a,0
       ld e,a
imul2: jr nz,imul0
       ld h,e
       ret

; --- Divide ---

idiv:  ld b,8
       xor a
idiv0: sla d
       rla
       cp e
       jr c,idiv1
       sub e
       inc d
idiv1: djnz idiv0
       ret

; --- Show objects ---

shwob: ld a,(numob)
       ld b,a
       ld ix,objdta
       ld de,39
shwob0:
       push bc
       push de
       ld a,(ix+33)
       ld hl,scno
       cp (hl)
       call z,dobj
       pop de
       pop bc
       add ix,de
       djnz shwob0
       ret

; Display object
dobj:  ld a,(ix+34)
dobj0: ld (dispx),a
       ld a,(ix+35)
       ld (dispy),a
dobj1: jp sprite

; Display object with colour
dobjc: call dobj
       jp cspr

; Colour an object
cobj:  ld a,(ix+8)
       ld d,a
       rlca
       rlca
       ld l,a
       and 3
       add a,88
       ld h,a
       ld a,l
       and 224
       ld l,a
       ld a,(ix+9)
       rra
       rra
       rra
       and 31
       add a,l
       ld l,a
       ld a,d
       and 7
       ld b,3
       jr nz,cobj0
       dec b
cobj0: ld a,(ix+0)
       and 7
       ld c,a
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
       inc l
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
       inc l
       ld a,(ix+9)
       and 7
       jr z,cobj1
       ld a,(hl)
       and SIMASK
       or c
       ld (hl),a
cobj1: ld de,30
       add hl,de
       djnz cobj0
       ret

; Remove object
remob: call findob
       ld (hl),254
       ret

; Get object
getob: push af
       call findob
       ld a,(hl)
       ld hl,scno
       cp (hl)
       jr nz,getob0
       pop af
       push af
       push hl
getob1:
       call findob
       ld (hl),255
       pop hl
       pop af
       ret
getob0:
       pop af
       push af
       push hl
       jr getob1

; Got object check
gotob: push hl
       call findob
gotob1:
       ld a,(hl)
       cp 255
       pop hl
       ret
gotob0:
       ret

; Find object in table
findob:
       ld hl,objdta+33
       ld de,39
       and a
       ret z
       ld b,a
fndob2:
fndob1:
       add hl,de
       djnz fndob1
       ret

; Drop object
drpob: push af
       call findob
       ld a,(scno)
       ld (hl),a
       inc hl
       ld a,(dispx)
       ld (hl),a
       inc hl
       ld a,(dispy)
       ld (hl),a
       pop af
       ret

; Seek objects at sprite position
skobj: ld a,(numob)
       ld b,a
       ld ix,objdta
       ld de,39
       xor a
       ld (varobj),a
skobj0:
       push bc
       push de
       ld a,(ix+33)
       ld hl,scno
       cp (hl)
       jr nz,skobj2
skobj1:
       ld a,(ix+34)
       pop de
       pop bc
       add ix,de
       ld hl,varobj
       inc (hl)
       djnz skobj0
       ret
skobj2:
skobj3:
       pop de
       pop bc
       add ix,de
       ld hl,varobj
       inc (hl)
       djnz skobj0
       ret

; --- Spawn sprite ---

spawn: ld (spptr),ix
numsp1:
       ld b,NUMSPR-1
       ld ix,sprtab+TABSIZ
spaw0: ld a,(ix+0)
       inc a
       jr z,spaw1
       ld de,TABSIZ
       add ix,de
       djnz spaw0
       ret
spaw1: call cpsp
       ld a,(ix+PAM1ST)
       ld (ix+X),a
       ld a,(ix+PAM1ST+1)
       ld (ix+Y),a
       ld (ix+10),0
       ld (ix+11),0
       ld (ix+12),0
       ld (ix+13),0
       ld (ix+14),0
       ld (ix+15),0
       ld (ix+16),0
rtssp: ld (ogptr),ix
evis1: call evnt09
       ld ix,(spptr)
       ret

spptr  defw 0
seed   defb 0
score  defb '0','0','0','0','0','0'
hiscor defb '0','0','0','0','0','0'
bonus  defb '0','0','0','0','0','0'
grbase defw 0

; --- Check x position ---

checkx:
       ld a,(ix+X)
       cp 177
       ret

; --- Display score ---

dscor: ld a,(dispx)
       push af
       ld a,(dispy)
       push af
       call preprt
       ld hl,score
       ld b,6
dscor0:
       push bc
       push hl
       ld a,(hl)
       call achar
       pop hl
       pop bc
       inc hl
       djnz dscor0
dscor2:
       pop af
       ld (dispy),a
       pop af
       ld (dispx),a
       ret

; Big score display
bscor0:
       push bc
       push hl
       ld a,(hl)
       call bchar
       pop hl
       pop bc
       inc hl
       djnz bscor0
       jr dscor2

; --- Add to score ---

addsc: ld de,score+5
       ld b,6
       and a
incsc: ld a,(de)
       adc a,(hl)
       ld (de),a
       sub '0'+10
       jr c,incsc0
incsc0:
       add a,'0'+10
       ld (de),a
       dec de
       dec hl
incsc2:
       djnz incsc
       ret

; Add bonus to score
addbo: ld hl,bonus+5
       ld de,score+5
       ld b,6
       and a
addbo0:
       ld a,(de)
       adc a,(hl)
       sub '0'
       ld c,a
       sub 10
       jr c,addbo1
       ld c,a
       scf
addbo1:
       ld a,c
       add a,'0'
       ld (de),a
       dec hl
       dec de
       djnz addbo0
       ret

; Swap score and bonus
swpsb: ld hl,score
       ld de,bonus
       ld b,6
swpsb0:
       ld a,(de)
       ld c,(hl)
       ld (hl),a
       ld a,c
       ld (de),a
       inc hl
       inc de
       djnz swpsb0
       ret

; --- Print address routines ---

gprad: ld a,(dispx)
       and 24
       add a,64
       ld d,a
       ld a,(dispx)
       and 7
       rrca
       rrca
       rrca
       ld e,a
       ld a,(dispy)
       add a,e
       ld e,a
       ret

pradd: ld a,(dispx)
       rrca
       rrca
       rrca
       and 31
       ld l,a
       ld a,(dispy)
       add a,l
       ld l,a
       ld h,MAP/256
       ret

gaadd: ld a,(dispx)
       rlca
       rlca
       ld l,a
       and 3
       add a,88
       ld h,a
       ld a,l
       and 224
       ld l,a
       ld a,(dispy)
       add a,l
       ld l,a
       ret

; Print character
pchar: sub 32
       ld l,a
       ld h,0
       add hl,hl
       add hl,hl
       add hl,hl
       ld de,(grbase)
       add hl,de
pchark:
       call gprad
       ex de,hl
       ld b,8
       ld de,256
pchar0:
       ld a,(bc)
       ld (hl),a
       inc bc
       add hl,de
       djnz pchar0
       ret

; Collectable block pattern
colpat defb 0

; Print attributes, properties and pixels
pattr: push af
       call pradd
       pop af
       ld (hl),a
pattr1:
       ld a,(hl)
       ld hl,(colptr)
       ld d,0
       ld e,a
       add hl,de
       ld a,(hl)
       call panp
       ret

; Print attributes, no properties
panp:  push af
       call gaadd
       pop af
       ld (hl),a
       ld a,(dispx)
       push af
       call pchr
       ld a,(dispy)
       inc a
       ld (dispy),a
       call pchr
       pop af
       ld (dispx),a
       ret

; Print char and advance
pchr:  ld a,(dispx)
       push af
       ld a,(dispy)
       push af
       ld hl,(grbase)
       ld (grbase),hl
       pop af
       ld (dispy),a
       pop af
       ld (dispx),a
       ret

; --- XOR sprite ---

sprite:
       ld a,(ix+8)
       cp 177
       ret nc
       ld a,(ix+9)
       and 7
       jr z,sprit0
       cp 5
       jr nc,sprit7
       ld b,a
sprit3:
       ; shift sprite right B pixels
       ret
sprit7:
       ; shift sprite left
       ret
sprit0:
       ; sprite aligned to char boundary
       ret

; --- Room routines ---

groom: ld a,(scno)
groomx:
       ld hl,(scrptr)
groom1:
       and a
       ret z
       push af
groom0:
       ld a,(hl)
       inc hl
       and a
       jp m,groom0
       pop af
       dec a
       jr groom1

; Draw current room
droom: ld hl,(blkptr)
droom2:
       ld (grbase),hl
       ld hl,MAP
       push hl
       call groom
droom0:
       ld a,(winhgt)
       ld c,a
       ld a,(wintop)
       ld (dispx),a
droom1:
       ld a,(winlft)
       ld (dispy),a
       ld a,(winwid)
       ld b,a
       push bc
       call flbyt
       call pattr
       pop bc
       djnz droom1
       ld a,(dispx)
       inc a
       ld (dispx),a
       dec c
       jr nz,droom0
       pop hl
       ret

; Decompress byte
flbyt: ld a,(comcnt)
       and a
       jr nz,flbyt1
       ld a,(hl)
       inc hl
       cp 255
       ret nz
       ld a,(hl)
       inc hl
       ld (combyt),a
       ld a,(hl)
       inc hl
       ld (comcnt),a
flbyt1:
       ld a,(comcnt)
       dec a
       ld (comcnt),a
       ld a,(combyt)
       ret

combyt defb 0
comcnt defb 0

; --- Movement checks ---

laddd: ld a,(ix+X)
       add a,12
numsp5:
       ld (dispx),a
       jr laddv

laddu: ld a,(ix+X)
numsp6:
       add a,14
       ld (dispx),a
laddv: ld a,(ix+Y)
       add a,4
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       call tstbl
       cp LADDER
       ret

; Can go up
cangu: ld a,(ix+X)
       ld (dispx),a
       ld a,(ix+Y)
       add a,4
numsp3:
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       call tstbl
       jp plchk

; Can go down
cangd: ld a,(ix+X)
       add a,16
       ld (dispx),a
       ld a,(ix+Y)
       add a,4
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       call tstbl
       jp plchk

; Can go left
cangl: ld a,(ix+Y)
       add a,3
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       jr cangh

; Can go right
cangr: ld a,(ix+Y)
       add a,12
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a

cangh: ld a,(ix+X)
       ld (dispx),a
cangh2:
       ld b,3
       and 7
       jr nz,cangh0
       dec b
cangh0:
       call tstbl
cangh1:
       call lrchk
       ret nz
       ld a,(dispx)
       add a,8
       ld (dispx),a
       djnz cangh0
       xor a
       ret

; Left/right check
lrchk: cp WALL
       ret z
       cp FODDER
       ret z
lrchkx:
       xor a
       ret

always:
       xor a
       ret

; Platform check
plchk: cp WALL
       jr z,plchkx
       cp FODDER
       jr z,plchkx
       cp PLATFM
       jr z,plchkx
plchk0:
       xor a
       ret
plchkx:
       ld a,1
       ret

; Ladder check
ldchk: cp LADDER
       ret

; Collectables
getcol:
       ld ix,sprtab
       ld a,(ix+X)
       add a,4
       ld (dispx),a
       ld a,(ix+Y)
       add a,4
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       call pradd
       ld a,(hl)
       cp COLECT
       call z,gtblk
       ret

gtblk: ld a,(colpat)
       push hl
       ld hl,(blkptr)
       ld (grbase),hl
       call pattr
       pop hl
       ld (hl),0
       call evnt20
       ret

; Touched deadly
tded:  ld a,(ix+X)
       add a,4
       ld (dispx),a
       ld a,(ix+Y)
       add a,4
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       call tstbl
       cp DEADLY
       ret z
       cp CUSTOM
       ret z
tded0: ld a,(ix+X)
       add a,12
       ld (dispx),a
       call tstbl
       cp DEADLY
       ret z
       cp CUSTOM
       ret z
tded1: ld a,(ix+Y)
       add a,12
       rrca
       rrca
       rrca
       and 31
       ld (dispy),a
       ld a,(ix+X)
       add a,4
       ld (dispx),a
       call tstbl
       cp DEADLY
       ret z
       cp CUSTOM
       ret z
       ld a,(ix+X)
       add a,12
       ld (dispx),a
       call tstbl
       cp DEADLY
       ret z
       cp CUSTOM
       ret

; Get block type
tstbl: push hl
       call pradd
       ld a,(hl)
       pop hl
       ret

; --- Jump/physics ---

jump:  ld a,(ix+13)
       and a
       ret nz
       ld (ix+13),1
jump0: ld hl,jtab
       ld (ix+14),0
       ld (ix+15),l
       ld (ix+16),h
       ret

hop:   ld a,(ix+13)
       and a
       ret nz
       ld (ix+13),1
       jr jump0

; Random number
random:
       ld hl,(seed)
       ld a,h
       and 128
       ld b,a
       ld a,l
       rlca
       rlca
       and 224
       xor h
       rra
       ld c,a
       ld a,b
       rla
       rl c
       rra
       and 128
       or l
       ld l,a
       xor h
       ld h,a
       ld (seed),hl
       ld a,l
       ld (varrnd),a
       ret

; --- Keyboard test ---

ktest: ld a,b
       and 7
       ld c,a
       ld a,b
       rrca
       rrca
       rrca
       and 31
       ld b,a
       ld a,254
ktest0:
       rlca
       djnz ktest0
       in a,(254)
ktest1:
       rra
       dec c
       jp p,ktest1
       ret

; --- Joystick/keyboard reading ---

joykey:
       ld a,(contrl)
       and a
       jr z,joyke0
       dec a
       jr z,joyjoy
       dec a
       jr z,joysin
       ; Mouse: fall through
joyke0:
       ld hl,keys
       ld e,0
       ld d,5
       ld b,(hl)
       inc hl
       call ktest
       jr c,joyk0
       set 3,e
joyk0: ld b,(hl)
       inc hl
       call ktest
       jr c,joyk1
       set 2,e
joyk1: ld b,(hl)
       inc hl
       call ktest
       jr c,joyk2
       set 0,e
joyk2: ld b,(hl)
       inc hl
       call ktest
       jr c,joyk3
       set 1,e
joyk3: ld b,(hl)
       call ktest
       jr c,joyk4
       set 4,e
joyk4: ld a,e
       ld (joyval),a
       ret

; Kempston joystick
joyjoy:
       in a,(31)
joyjo3:
       ld e,a
joyjo0:
       ld a,(keys+5)
       ld b,a
       call ktest
joyjo1:
       jr c,joyjo2
       set 4,e
joyjo2:
       ld a,e
       ld (joyval),a
       ret

; Sinclair joystick
joysin:
       ld bc,63486
       in a,(c)
       ld e,0
       rra
       jr c,joysi1
       set 0,e
joysi1:
       rra
       jr c,joysi2
       set 1,e
joysi2:
       rra
       jr c,joysi3
       set 2,e
joysi3:
       rra
       jr c,joysi4
       set 3,e
joysi4:
       rra
       jr c,joysi5
       set 4,e
joysi5:
joysi0:
       ld a,e
       ld (joyval),a
       ret

; --- Display message ---

dmsg:  push af
       ld hl,msgdat
       pop af
dmsg3: call getwrd
       call preprt
dmsg0: ld a,(hl)
       cp ','
       jr z,dmsg1
       cp 13
       jr z,dmsg4
dmsg2: and 127
       push hl
       call achar
       pop hl
       ld a,(hl)
       inc hl
       and a
       jp m,dmsg1
       jr dmsg0
dmsg1: ret
dmsg4: inc hl
       call nexlin
       jr dmsg0

; Print mode
prtmod defb 0

; Big message
bmsg1: push af
       ld hl,msgdat
       pop af
       call getwrd
       call preprt
bmsg0: ld a,(hl)
bmsg3: cp ','
       jr z,bmsg2
       cp 13
       jr z,bmsg2
       and 127
       push hl
       call bchar
       pop hl
       ld a,(hl)
       inc hl
       and a
       jp m,bmsg2
       jr bmsg0
bmsg2: ret

; Big (double-height) character
bchar: sub 32
       ld l,a
       ld h,0
       add hl,hl
       add hl,hl
       add hl,hl
       ld de,(grbase)
       add hl,de
       push hl
       call gprad
       ex de,hl
       pop bc
       ld d,8
bchar0:
       ld a,(bc)
       ld (hl),a
       call nline
       ld (hl),a
       call nline
       inc bc
       dec d
       jr nz,bchar0
bchar1:
       ret
bchar3:
bchar2:
       ret

; Display a character
achar: ld e,a
       ld a,(prtmod)
       and a
       ld a,e
       jr nz,bchar
       call pchar
       jp nexpos

; Next position
nexpos:
       ld hl,dispy
       inc (hl)
       ret

; Next line
nexlin:
       ld a,(prtmod)
       and a
       jr nz,nexln2
       ld hl,dispx
       inc (hl)
       ld a,(winlft)
       ld (dispy),a
       ret
nexln2:
       ld hl,dispx
       inc (hl)
       inc (hl)
       ld a,(winlft)
       ld (dispy),a
       ret

; Pre-print preliminaries
preprt:
       ld hl,(23606)
prescr:
       ld (grbase),hl
       ld a,(wintop)
       ld (dispx),a
       ld a,(winlft)
       ld (dispy),a
       ret

; Get word from list
getwrd:
       and a
       ret z
       ld b,a
getwrd0:
       ld a,(hl)
       inc hl
       and a
       jp p,getwrd0
       djnz getwrd0
       ret

; --- Bubble sort sprites ---

bsort: ld ix,sprtab
       ld b,NUMSPR-1
       ld c,0
bsort0:
       push bc
       ld a,(ix+0)
       inc a
       jr z,swemp
       ld e,(ix+X)
       ld a,(ix+TABSIZ)
       inc a
       jr z,bsort2
       ld a,e
       cp (ix+TABSIZ+X)
       jr c,bsort2
       jr z,bsort2
bsort1:
       call swspr
       pop bc
       ld c,1
       jr bsort3
swemp: ld a,(ix+TABSIZ)
       inc a
       jr z,bsort2
       call swspr
       pop bc
       ld c,1
       jr bsort3
bsort2:
       pop bc
bsort3:
       ld de,TABSIZ
       add ix,de
       djnz bsort0
       ld a,c
       and a
       jr nz,bsort
       ret

; Swap two sprites
swspr: push bc
       ld b,TABSIZ
       push ix
       pop hl
       push hl
       ld de,TABSIZ
       add hl,de
       ex de,hl
       pop hl
swspr0:
       ld a,(de)
       ld c,(hl)
       ld (hl),a
       ld a,c
       ld (de),a
       inc hl
       inc de
       djnz swspr0
       pop bc
       ret

; --- Process sprites ---

pspr:  ld b,NUMSPR
       ld ix,sprtab
pspr1: push bc
       ld a,(ix+0)
       inc a
       jr z,pspr0
       ld a,(ix+5)
       ld (ix+0),a
       ld a,(ix+6)
       ld (ix+1),a
       ld a,(ix+7)
       ld (ix+2),a
       ld a,(ix+X)
       ld (ix+3),a
       ld a,(ix+Y)
       ld (ix+4),a
pspr2: ld a,(ix+0)
       and a
       jr z,pspr0
rtorg: ld (ogptr),ix
rtorg0:
pspr3:
       ld a,(ix+0)
pspr4: ld hl,evtyp0
       add a,a
       add a,l
       ld l,a
       ld a,(hl)
       inc hl
       ld h,(hl)
       ld l,a
       push hl
       ret
pspr0: pop bc
       ld de,TABSIZ
       add ix,de
       djnz pspr1
       ret

ogptr  defw 0

; Event handler addresses (filled by compiler)
evtyp0 defw evnt00
evtyp1 defw evnt01
evtyp2 defw evnt02
evtyp3 defw evnt03
evtyp4 defw evnt04
evtyp5 defw evnt05
evtyp6 defw evnt06
evtyp7 defw evnt07
evtyp8 defw evnt08

; --- Display sprites ---

dspr:  push bc
dspr0: ld a,(ix+5)
       inc a
       jr z,dspr5
       ld a,(ix+0)
       inc a
       jr z,dspr2
dspr1: ld a,(ix+3)
       cp 177
       jr nc,dspr5
       ld a,(ix+5)
       cp (ix+0)
       jr nz,dspr7
       ld a,(ix+6)
       cp (ix+1)
       jr nz,dspr7
       ld a,(ix+7)
       cp (ix+2)
       jr nz,dspr7
       ld a,(ix+X)
       cp (ix+3)
       jr nz,dspr7
       ld a,(ix+Y)
       cp (ix+4)
       jr z,dspr5
dspr7: push bc
       call sspric
       pop bc
       jr dspr5
dspr6: push bc
       call sspria
       pop bc
       jr dspr5
dspr5: ld de,TABSIZ
       add ix,de
       pop bc
       djnz dspr
       ret
dspr2: ld a,(ix+5)
       inc a
       jr z,dspr5
dspr3: push bc
       call ssprib
       pop bc
       jr dspr5
dspr4: push bc
       call sspric
       pop bc
       jr dspr5

; --- Get sprite screen address ---

gspran:
       ld a,(ix+X)
       ld b,(ix+Y)
       jr gspra0

gsprad:
       ld a,(ix+3)
       ld b,(ix+4)

gspra0:
       ld l,a
       and 7
       rrca
       rrca
       rrca
       ld e,a
       ld a,l
       and 248
       add a,64
       ld d,a
       ld a,b
       rra
       rra
       rra
       and 31
       add a,e
       ld e,a
       ret

; Screen address from coordinates
scadd: ld a,d
       and 248
       add a,64
       ld h,a
       ld a,d
       and 7
       rrca
       rrca
       rrca
       ld l,a
       ld a,e
       rra
       rra
       rra
       and 31
       add a,l
       ld l,a
       ret

; Sprite mask table
spmask defb 255,127,63,31,15,7,3,1

; --- Show single sprite ---

sspria:
       call gsprad
sspri2:
       ld b,16
sspri0:
       ld a,(hl)
       xor (ix+3)  ; simplified
       ld (hl),a
       call nline
       djnz sspri0
       ret

ssprib:
       call gspran
       jr sspri2

sspric:
       call gsprad
       push de
       call gspran
       pop de
       ret

; --- Draw sprite line ---

dline: ret

; Next line address
nline: inc h
       ld a,h
       and 7
       ret nz
       ld a,l
       add a,32
       ld l,a
       ld a,h
       jr c,nline0
       sub 8
       ld h,a
       ret
nline0:
       ret

; --- Animate sprite ---

animsp:
       ld a,(ix+2)
       inc a
       ld hl,(frmptr)
       jr anims1
animbk:
       ld a,(ix+2)
       dec a
anims1:
       ld e,a
       ld d,0
       add hl,de
       ld a,(ix+1)
       cp (hl)
       jr nz,anims0
       xor a
anims0:
       ld (ix+7),a
       ret

rtanb0:
       ret

; --- Seek sprite by type ---

sktyp: push ix
numsp2:
       ld b,NUMSPR
       ld ix,sprtab
sktyp0:
       ld a,(ix+0)
       cp c
       jr z,sktyp2
sktyp1:
       ld de,TABSIZ
       add ix,de
       djnz sktyp0
       pop ix
       ret
sktyp2:
       ld (skptr),ix
       call coltyp
       jr nz,sktyp1
       pop ix
       ret

skptr  defw 0

; Collision type check
coltyp:
       push ix
       ld ix,(skptr)
colty0:
       pop ix
       ret
colty1:
       ret

; 16x16 collision check
colc16:
       ld a,(ix+X)
       sub (iy+X)
colc1a:
       jr nc,colc1a0
       neg
colc1a0:
       cp 16
       ret nc
       ld a,(ix+Y)
       sub (iy+Y)
colc1b:
       jr nc,colc1b0
       neg
colc1b0:
       cp 16
       ret

; Display number
disply:
       ld hl,displ0
       call num2td
       ld hl,displ0
       ld a,(hl)
       call achar
       inc hl
       ld a,(hl)
       call achar
       inc hl
       ld a,(hl)
       call achar
       ret
displ0 defb 0,0,0,0

; --- Screen navigation ---

initsc:
       ld a,(scno)
       ld hl,mapdat
       jp tstsc

tstsc: ld b,a
       ld de,MAPWID
tstsc0:
       ld a,b
       and a
       ret z
       add hl,de
       dec b
       jr tstsc0

scrl:  ld a,(scno)
       ld hl,mapdat
scrl0: and a
       jr z,scrl1
       add hl,de
       dec a
       jr scrl0
scrl1: dec hl
       ld a,(hl)
       ld (scno),a
       ret

scrr:  ld a,(scno)
       inc a
       jr nwscr
scru:  ld a,(scno)
       sub MAPWID
       jr nwscr
scrd:  ld a,(scno)
       add a,MAPWID

nwscr: ld (scno),a
nwscr0:
       ld hl,mapdat
       ld b,0
nwscr1:
       ld a,(hl)
       cp 255
       ret z
       ld a,(scno)
       cp (hl)
       ret z
       inc hl
       inc b
       jr nwscr1

; --- Gravity ---

grav:  ld a,(ix+13)
       and a
       ret z
       ld hl,(ix+15)  ; simplified - use pointer
       ld a,(hl)
grav0: ld b,a
       and 127
       jr z,gravst
       bit 7,b
       jr nz,gravu
gravd: ld b,a
gravd0:
       ld a,(ix+X)
       inc a
       ld (ix+X),a
       djnz gravd0
       inc hl
       ld (ix+15),l
       ld (ix+16),h
       ret
gravu: ld b,a
gravu0:
       ld a,(ix+X)
       dec a
       ld (ix+X),a
       djnz gravu0
       inc hl
       ld (ix+15),l
       ld (ix+16),h
       ret
gravst:
       ld (ix+13),0
       ret
evftf: call evnt15
       ret

; Old gravity (4.6/4.7 compat)
ogrv:  ld a,(ix+13)
       and a
       ret z
ogrv0:
ogrv1: ld hl,(ix+15)
       ld a,(hl)
       and a
       jr z,ogrvst
       bit 7,a
       jr nz,ogrvu
ogrvd: and 127
       ld b,a
ogrvd0:
       ld a,(ix+X)
       inc a
       ld (ix+X),a
       djnz ogrvd0
       inc hl
       ld (ix+15),l
       ld (ix+16),h
       ret
ogrvu: and 127
       ld b,a
ogrvu0:
       ld a,(ix+X)
       dec a
       ld (ix+X),a
       djnz ogrvu0
       inc hl
       ld (ix+15),l
       ld (ix+16),h
       ret
ogrvst:
       ld (ix+13),0
       ret
ogrv2:
ogrv4:
ogrv3:
       ret

; Initiate fall
ifall: ld a,(ix+13)
       and a
       ret nz
       ld (ix+13),1
ifalls:
       ld hl,jtab
       ld a,0
       ld b,a
ifall0:
       ld a,(hl)
       and a
       jr z,ifall1
       inc hl
       bit 7,a
       jr z,ifall0
       inc b
       jr ifall0
ifall1:
       ld (ix+15),l
       ld (ix+16),h
       ret

; Table fall
tfall: ld a,(ix+13)
       and a
       ret nz
       ld (ix+13),1
       ld hl,jtab
       ld (ix+15),l
       ld (ix+16),h
       ret

; Get frame data
gfrm:  ld l,(ix+1)
       ld h,0
       add hl,hl
       add hl,hl
       add hl,hl
       add hl,hl
       add hl,hl
       ld de,(frmptr)
       add hl,de
       ret

; --- Sprite list for current room ---

sprlst:
       ld a,(scno)
sprls2:
       ld hl,(nmeptr)
sprls1:
       and a
       ret z
       push af
sprls0:
       ld a,(hl)
       inc hl
       cp 255
       jr nz,sprls0
       pop af
       dec a
       jr sprls1

; Clear non-player sprites
nspr:  ld ix,sprtab+TABSIZ
       ld b,SPRBUF-TABSIZ
nspr0: ld (hl),255
       inc hl
       djnz nspr0
       ret
nspr1:
nspr2:
       ret

; Init sprites from room data
ispr:  call sprlst
ispr2: ld a,(hl)
       cp 255
       ret z
       ld b,NUMSPR
       ld ix,sprtab
ispr1: ld a,(ix+0)
       inc a
       jr z,ispr3
ispr4: ld de,TABSIZ
       add ix,de
       djnz ispr1
       ret
ispr3: call cpsp
       jr ispr2

; Init sprites keeping player
kspr:  call sprlst
kspr2: ld a,(hl)
       cp 255
       ret z
       ld b,NUMSPR-1
       ld ix,sprtab+TABSIZ
kspr1: ld a,(ix+0)
       inc a
       jr z,kspr3
kspr4: ld de,TABSIZ
       add ix,de
       djnz kspr1
       ret
kspr3: call cpsp
       jr kspr2

; Copy sprite from list to table
cpsp:  push hl
       push bc
       ld a,(hl)
       ld (ix+0),a
       ld (ix+5),a
       inc hl
       ld a,(hl)
       ld (ix+1),a
       ld (ix+6),a
       inc hl
       ld a,(hl)
       ld (ix+3),a
       ld (ix+PAM1ST),a
       ld (ix+X),a
       inc hl
       ld a,(hl)
       ld (ix+4),a
       ld (ix+PAM1ST+1),a
       ld (ix+Y),a
       inc hl
       xor a
       ld (ix+2),a
       ld (ix+7),a
       ld (ix+10),a
       ld (ix+11),a
       ld (ix+12),a
       ld (ix+13),a
       ld (ix+14),a
       ld (ix+15),a
       ld (ix+16),a
evis0: call evnt09
       pop bc
       pop hl
       ret

; --- Clear window ---

clw:   ld a,(wintop)
       ld (dispx),a
       ld a,(winhgt)
       ld c,a
clw3:  ld a,(winlft)
       ld (dispy),a
       ld a,(winwid)
       ld b,a
clw2:  push bc
       call gprad
       ex de,hl
       ld b,8
clw1:  ld (hl),0
       inc h
       djnz clw1
       push hl
       call gaadd
       ld a,(23693)
       ld (hl),a
       call pradd
       ld (hl),0
       pop hl
       pop bc
       ld hl,dispy
       inc (hl)
       djnz clw2
       ld hl,dispx
       inc (hl)
       dec c
       jr nz,clw3
       ret

; --- Scrolling ticker ---

scrly: ld a,(txtbit)
       and a
       ret z
       ld hl,(txtscr)
       ld b,8
scrly1:
       push bc
       push hl
       ld c,0
       ld b,(txtwid)  ; simplified
scrly0:
       rl c
       ld a,(hl)
       rla
       ld (hl),a
       dec hl
       djnz scrly0
       pop hl
       call nline
       pop bc
       djnz scrly1
       ld a,(txtbit)
       rrca
       ld (txtbit),a
       ret nc
scrly5:
       ld hl,(txtpos)
       ld a,(hl)
       and a
       jp m,scrly4
       cp 13
       jr z,scrly4
       sub 32
       ld l,a
       ld h,0
       add hl,hl
       add hl,hl
       add hl,hl
       ld de,(grbase)
       add hl,de
       push hl
       ld hl,(txtscr)
       ld b,8
scrly3:
       pop de
       push de
       ld a,(de)
       inc de
       push de
       and (txtbit)  ; simplified
       jr z,scrly2
       scf
scrly2:
       rl (hl)
       call nline
       pop de
       djnz scrly3
       pop de
scrly4:
       ld hl,(txtpos)
       inc hl
       ld a,(hl)
       and a
       jp p,scrly6
       ld hl,(txtini)
scrly6:
       ld (txtpos),hl
       ld a,128
       ld (txtbit),a
       ret

; Initialise scrolling
iscrly:
       ld a,(hl)
       ld (txtwid),a
       inc hl
       and a
       jr z,iscrl0
       ld (txtini),hl
       ld (txtpos),hl
       ld a,(wintop)
       add a,(winhgt)  ; simplified
       ld (dispx),a
       ld a,(winlft)
       add a,(winwid)  ; simplified
       ld (dispy),a
       call gprad
       ld (txtscr),de
       ld a,128
       ld (txtbit),a
       ret
iscrl0:
       xor a
       ld (txtbit),a
       ret

; Redraw blocks (adventure mode)
rbloc: ret

; Play sound
plsnd: ret

; --- Sprite table ---

sprtab:
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
       defb 255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255
ssprit defb 255,255,255,255,255,255,255,0,192,120,0,0,0,255,255,255,255

roomtb defb 34

; Sounds
fx1:

; === Stub event handlers (replaced by compiler) ===
evnt00: ret
evnt01: ret
evnt02: ret
evnt03: ret
evnt04: ret
evnt05: ret
evnt06: ret
evnt07: ret
evnt08: ret
evnt09: ret
evnt10: ret
evnt11: ret
evnt12: ret
evnt13: ret
evnt14: ret
evnt15: ret
evnt16: ret
evnt17: ret
evnt18: ret
evnt19: ret
evnt20: ret

; === Stub external data (replaced by compiler) ===
font:   defs 768,0
frmlst: defw 0
chgfx:  defs 8,0
bcol:   defb 0
bprop:  defb 0
scdat:  defb 0,128
nmedat: defb 255
objdta: defs 39*8,0
msgdat: defb 'X'+128
mapdat: defb 0,1,2,3,255
numsc:  defb 4
stmap:  defb 0
keys:   defb 0,0,0,0,0,0
jtab:   defb 6,4,3,2,1,1,0,129,129,130,131,132,134,0
palett: defs 64,0
