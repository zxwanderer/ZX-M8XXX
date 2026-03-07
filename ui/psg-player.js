// PSG Player — template ASM source download button

export function initPsgPlayer({ showMessage }) {
    const btnPsgPlayer = document.getElementById('btnPsgPlayer');

    const PLAYER_SOURCE = `; PSG Player for ZX Spectrum
; Simple player for PSG files exported from ZX-M8XXX
; Assemble with sjasmplus
;
; Usage:
;   1. Include your PSG data at PSG_DATA label (INCBIN "music.psg")
;   2. Assemble: sjasmplus psg_player.asm
;   3. Load music.sna and run
;   4. Press Space to stop

        DEVICE ZXSPECTRUM128

        ORG #8000

AY_REG  EQU #FFFD       ; AY register select port
AY_DATA EQU #BFFD       ; AY data port

START:
        DI
        LD HL,PSG_DATA+16   ; Skip 16-byte header
        EI

PLAY_LOOP:
        LD A,(HL)
        INC HL

        CP #FD              ; End of music?
        JR Z,MUSIC_END

        CP #FF              ; End of frame?
        JR Z,WAIT_FRAME

        CP #FE              ; Multiple empty frames?
        JR Z,SKIP_FRAMES

        ; Register write: A = register, next byte = value
        LD BC,AY_REG
        OUT (C),A           ; Select register
        LD A,(HL)
        INC HL
        LD BC,AY_DATA
        OUT (C),A           ; Write value
        JR PLAY_LOOP

SKIP_FRAMES:
        ; 0xFE followed by count (frames = count * 4)
        LD A,(HL)
        INC HL
        LD B,A
        SLA B
        SLA B               ; B = count * 4
SKIP_LOOP:
        CALL WAIT_INT
        DJNZ SKIP_LOOP
        JR PLAY_LOOP

WAIT_FRAME:
        CALL WAIT_INT
        JR PLAY_LOOP

WAIT_INT:
        ; Wait for interrupt (50Hz frame sync)
        LD A,#7F
        IN A,(#FE)          ; Check keyboard
        RRA
        JR NC,KEY_PRESSED   ; Space pressed - exit

        HALT                ; Wait for next interrupt
        RET

KEY_PRESSED:
        POP AF              ; Remove return address

MUSIC_END:
        ; Silence AY
        XOR A
        LD BC,AY_REG
        LD E,13             ; 14 registers (0-13)
SILENCE:
        OUT (C),A
        LD D,A
        LD BC,AY_DATA
        OUT (C),D
        LD BC,AY_REG
        INC A
        DEC E
        JP P,SILENCE

        RET

; Include your PSG data here
PSG_DATA:
        INCBIN "music.psg"

        SAVESNA "music.sna", START
`;

    btnPsgPlayer.addEventListener('click', () => {
        const blob = new Blob([PLAYER_SOURCE], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'psg_player.asm';
        a.click();
        URL.revokeObjectURL(url);
        showMessage('Downloaded psg_player.asm');
    });
}
