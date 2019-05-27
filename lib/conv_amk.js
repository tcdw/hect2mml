/* eslint-disable no-bitwise */

const { pad, trace8, trace16 } = require('./hex_addr');
const printableBuffer = require('./print_buffer');

const equalCmds = [
    [0xda], [0xdb], [0xdc], [0xde], [0xdf], [0xe0], [0xe1], [0xe2],
    [0xe3], [0xe4], [0xfa, 0x02], [0xe5], [0xe5, 0x00, 0x00, 0x00], [0xe7], [0xe8], [0xe9],
    [0xea], [0xeb], [0xec], [0xeb, 0x00, 0x00, 0x00], [0xee], [0xef], [0xf0], [0xf1],
    [0xf2], [0xdd],
];
const notes = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];

// 改写自 https://github.com/loveemu/spc_converters_legacy/blob/master/nintspc/src/nintspc.c
function getNoteLenForMML(tick, division) {
    const dotMax = 6;
    const note = division * 4;
    let l;
    let dot;
    let text = '';
    for (l = 1; l <= note; l += 1) {
        let cTick = 0;
        for (dot = 0; dot <= dotMax; dot += 1) {
            const ld = (l << dot);
            if (note % ld) {
                break;
            }
            cTick += note / ld;
            if (tick === cTick) {
                text += l;
                for (; dot > 0; dot -= 1) {
                    text += '.';
                }
                return text;
            }
        }
    }
    return `=${tick}`;
}

/**
 * @param {Buffer} chunk
 * @param {number} offset
 * @param {*} ast
 * @param {number} instPtr
 * @param {boolean} amkFix
 * @param {number} doubleTick
 * @param {number[]} mentionedAddr
 */
const convAMK = (chunk, offset, ast, mentionedAddr, instPtr, amkFix, doubleTick) => {
    let mml = '';
    const usedInst = [];
    const rmcs = [];
    const brrChunks = {};

    const getInst = (id) => {
        //
        // Format: $FF $E0 $B8 $04 $00
        //         +------ +-- +------
        //         | ADSR  |   | Tuning（大端序注意！）
        //                 |
        //                 | Gain (ADSR < $80)
        //
        const wantedPtr = instPtr + offset + id * 6;
        const sample = chunk[wantedPtr];
        let dr = chunk[wantedPtr + 1] >> 4;
        const ar = chunk[wantedPtr + 1] % 0x10;
        const sr = chunk[wantedPtr + 2] >> 5;
        const rr = chunk[wantedPtr + 2] % 0x20;
        const ga = chunk[wantedPtr + 3];
        const tuning = chunk.readUInt16BE(wantedPtr + 4);
        let adsr = true;
        if (dr < 8) {
            adsr = false;
        } else {
            dr -= 8;
        }
        return {
            sample, adsr, ar, dr, sr, rr, ga, tuning,
        };
    };

    const getBRR = (id) => {
        const sampleIndexPtr = chunk[0x1015D] * 0x100 + offset;
        const samplePtr = chunk.readUInt16LE(sampleIndexPtr + id * 4);
        const sampleLoop = chunk.readUInt16LE(sampleIndexPtr + id * 4 + 2) - samplePtr;
        let sampleCurrentPtr = samplePtr + offset;
        while (sampleCurrentPtr < (0xFFFF + offset)) {
            sampleCurrentPtr += 9;
            if (chunk[sampleCurrentPtr - 9] % 2 === 1) {
                break;
            }
        }
        const sampleLength = sampleCurrentPtr - (samplePtr + offset);
        const brr = Buffer.alloc(sampleLength + 2);
        brr.writeUInt16LE(sampleLoop);
        chunk.copy(brr, 2, samplePtr + offset, sampleCurrentPtr);
        return brr;
    };

    const getRMC = (str) => {
        let rmcIndex = rmcs.indexOf(str);
        if (rmcIndex < 0) {
            rmcs.push(str);
            rmcIndex = rmcs.length - 1;
        }
        return rmcIndex;
    };

    const defaultFIR = [
        Buffer.from([0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([0x58, 0xBF, 0xDB, 0xF0, 0xFE, 0x07, 0x0C, 0x0C]),
        Buffer.from([0x0C, 0x21, 0x2B, 0x2B, 0x13, 0xFE, 0xF3, 0xF9]),
        Buffer.from([0x34, 0x33, 0x00, 0xD9, 0xE5, 0x01, 0xFC, 0xEB]),
    ];
    const amkFIR0 = Buffer.from([0xFF, 0x08, 0x17, 0x24, 0x24, 0x17, 0x08, 0xFF]);
    const amkFIR1 = Buffer.from([0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const magicNum = Buffer.from([0x2F, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    if (chunk.compare(magicNum, 0, 9, 0x800, 0x809) === 0) {
        for (let i = 0; i < 4; i += 1) {
            defaultFIR[i] = chunk.slice(0x802 + i * 8, 0x802 + 8 + i * 8);
        }
    }
    for (let channel = 0; channel < ast.length; channel += 1) {
        mml += `#${channel}\n`;
        const currentTrack = ast[channel].trackData;
        let privOctave = 0;
        let curLength = 0;
        let curLenRate = 0;
        let curOctave = 0;
        let curNote = 0;
        let curPan = 0;
        let curAR = 15;
        let curDR = 7;
        let curSR = 7;
        let curRR = 0;
        let holdADSR = false;
        let holdRMC = false;
        let holdOctave = false;
        let nowRMCR = '';
        let prevRMCR = '';
        let nowRMCC = '';
        let prevRMCC = '';
        for (let i = 0; i < currentTrack.length; i += 1) {
            if (mentionedAddr.indexOf(currentTrack[i].addr) >= 0) {
                mml += `\n; !!! ${trace16(currentTrack[i].addr)} is mentioned !!!\n`;
            }
            const data = currentTrack[i].data;
            const first = data[0];
            if (first >= 0x1 && first <= 0x7F) {
                /*
                 *      Range: $01 - $7F
                 */
                curLength = doubleTick ? first * doubleTick : first;
                if (data.length > 1) {
                    curLenRate = data[1] >> 4;
                    mml += `\nq${pad(data[1].toString(16), 2)} `;
                }
            } else if (first >= 0x80 && first <= 0xc7) {
                /*
                 *      Range: $80 - $C7
                 */
                const bitDA = curDR * 0x10 + curAR;
                const bitSR = curSR * 0x20 + curRR;
                if (holdRMC) {
                    prevRMCR = nowRMCR;
                    nowRMCR = holdADSR ? `$ED ${trace8(bitDA)} ${trace8(bitSR)}` : '$F4 $09';
                    if (prevRMCR !== nowRMCR) {
                        mml += `\n(!${getRMC(nowRMCR) + 1000}, -1)\n`;
                    }
                    holdRMC = false;
                }
                if (holdADSR) {
                    mml += `\n$ED ${trace8(bitDA)} ${trace8(bitSR)}\n`;
                    holdADSR = false;
                }
                privOctave = curOctave;
                curOctave = Math.floor((first - 0x80) / 12) + 1;
                curNote = (first - 0x80) % 12;
                if (holdOctave || privOctave !== curOctave) {
                    mml += `o${curOctave} `;
                    holdOctave = false;
                }
                let length = '';
                if (amkFix && curLenRate >= 7) {
                    length = `=${curLength - 1} r=1`;
                } else {
                    length = getNoteLenForMML(curLength, 48);
                }
                mml += `${notes[curNote]}${length} `;
            } else if (first === 0xC8 || first === 0xC9) {
                /*
                 *      Range: $C8 - $C9
                 */
                const length = getNoteLenForMML(curLength, 48);
                mml += `${first === 0xC8 ? '^' : 'r'}${length} `;
            } else if ((first >= 0xca && first <= 0xdf) || (first >= 0xfa && first <= 0xfe)) {
                /*
                 *      Range: $CA - $DF, $FA - $FE
                 */
                mml += `\n; ${printableBuffer(data)} \n`;
            } else if (first >= 0xe0 && first <= 0xf9) {
                /*
                 *      Range: $E0 - $F9
                 */
                switch (first) {
                    case 0xE0: {
                        if (usedInst.indexOf(data[1]) < 0) {
                            usedInst.push(data[1]);
                        }
                        mml += `\nINSTX${pad(data[1].toString(16), 2)} `;
                        const inst = getInst(data[1]);
                        curAR = inst.ar;
                        curDR = inst.dr;
                        curSR = inst.sr;
                        curRR = inst.rr;
                        holdRMC = true;
                        break;
                    }
                    case 0xE1: {
                        if (data[1] <= 20) {
                            curPan = data[1];
                            mml += `y${data[1]} `;
                        } else {
                            const echoL = (data[1] >> 7) % 2;
                            const echoR = (data[1] >> 6) % 2;
                            curPan = data[1] % 0x40;
                            mml += `y${data[1]},${echoL},${echoR} `;
                        }
                        break;
                    }
                    case 0xE5: {
                        mml += `w${data[1]} `;
                        break;
                    }
                    case 0xE7: {
                        mml += `t${doubleTick ? data[1] * doubleTick : data[1]} `;
                        break;
                    }
                    case 0xED: {
                        mml += `v${data[1]} `;
                        break;
                    }
                    case 0xF7: {
                        if (mml[mml.length - 1] !== '\n') {
                            mml += '\n';
                        }
                        const nowFIR = defaultFIR[data[3]];
                        if (nowFIR.compare(amkFIR0) === 0) {
                            mml += `${printableBuffer(equalCmds[first - 0xE0])} ${printableBuffer(data.slice(1, -1))} $00 \n`;
                        } else if (nowFIR.compare(amkFIR1) === 0) {
                            mml += `${printableBuffer(equalCmds[first - 0xE0])} ${printableBuffer(data.slice(1, -1))} $01 \n`;
                        } else {
                            mml += `${printableBuffer(equalCmds[first - 0xE0])} ${printableBuffer(data.slice(1))} \n`;
                            mml += `$F5 ${printableBuffer(nowFIR)} \n`;
                        }
                        break;
                    }
                    default: {
                        if (doubleTick) {
                            const before = printableBuffer(data);
                            switch (first) {
                                case 0xE2:
                                case 0xE6:
                                case 0xE8:
                                case 0xEE:
                                case 0xF0:
                                case 0xF8: {
                                    data[1] *= doubleTick;
                                    if (data[1] > 255) {
                                        console.warn(`Warning: Param 1 (${trace16(data[1])}) at ${trace16(currentTrack[i].addr)} is larger than $FF`);
                                        data[1] = 255;
                                    }
                                    break;
                                }
                                case 0xE3:
                                case 0xEB: {
                                    data[1] *= doubleTick;
                                    data[2] = Math.round(data[2] / doubleTick);
                                    if (data[1] > 255) {
                                        console.warn(`Warning: Param 1 (${trace16(data[1])}) at ${trace16(currentTrack[i].addr)} is larger than $FF`);
                                        data[1] = 255;
                                    }
                                    break;
                                }
                                case 0xF1:
                                case 0xF2:
                                case 0xF9: {
                                    data[1] *= doubleTick;
                                    data[2] *= doubleTick;
                                    if (data[1] > 255) {
                                        console.warn(`Warning: Param 1 (${trace16(data[1])}) at ${trace16(currentTrack[i].addr)} is larger than $FF`);
                                        data[2] = 255;
                                    }
                                    if (data[2] > 255) {
                                        console.warn(`Warning: Param 2 (${trace16(data[1])}) at ${trace16(currentTrack[i].addr)} is larger than $FF`);
                                        data[2] = 255;
                                    }
                                    break;
                                }
                                default: {
                                    break;
                                }
                            }
                            const after = printableBuffer(data);
                            if (before !== after) {
                                console.log(`Notice: VCMD at ${trace16(currentTrack[i].addr)}: ${before} => ${after}`);
                            }
                        }
                        if (mml[mml.length - 1] !== '\n') {
                            mml += '\n';
                        }
                        mml += `${printableBuffer(equalCmds[first - 0xE0])} ${printableBuffer(data.slice(1))} \n`;
                        break;
                    }
                }
            } else if (first === 0xFF) {
                switch (data[1]) {
                    case 0x00: {
                        curAR = data[2];
                        holdADSR = true;
                        holdRMC = true;
                        break;
                    }
                    case 0x01: {
                        curDR = data[2];
                        holdADSR = true;
                        holdRMC = true;
                        break;
                    }
                    case 0x02: {
                        curSR = data[2];
                        holdADSR = true;
                        holdRMC = true;
                        break;
                    }
                    case 0x03: {
                        curRR = data[2];
                        holdADSR = true;
                        holdRMC = true;
                        break;
                    }
                    case 0x04: {
                        prevRMCC = nowRMCC;
                        nowRMCC = `$ED $80 ${trace8(data[2] + 0xA0)}`;
                        if (prevRMCC !== nowRMCC) {
                            mml += `\n(!${getRMC(nowRMCC) + 1000}, 3)\n`;
                        }
                        break;
                    }
                    case 0x0F: {
                        mml += `y${curPan},${data[2]},${data[3]} `;
                        break;
                    }
                    default: {
                        if (data[1] >= 0x05 && data[1] <= 0x09) {
                            holdOctave = true;
                        }
                        if (mml[mml.length - 1] !== '\n') {
                            mml += '\n';
                        }
                        mml += `; ${trace16(currentTrack[i].addr)}: ${printableBuffer(data)} \n`;
                        break;
                    }
                }
            }
        }
        mml += '\n\n';
    }
    usedInst.sort();
    for (let i = 0; i < usedInst.length; i += 1) {
        const inst = getInst(usedInst[i]);
        const { sample } = inst;
        brrChunks[sample] = getBRR(sample);
    }
    for (let i = 0; i < rmcs.length; i += 1) {
        mml = `(!${i + 1000})[${rmcs[i]}]\n${mml}`;
    }
    return {
        mml, usedInst, brrChunks,
    };
};

module.exports = convAMK;
