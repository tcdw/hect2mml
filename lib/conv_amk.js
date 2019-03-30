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

/**
 * @param {Buffer} chunk
 * @param {number} offset
 * @param {*} ast
 * @param {number} instPtr
 */
const convAMK = (chunk, offset, ast, instPtr, amkFix) => {
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
        for (let i = 0; i < currentTrack.length; i += 1) {
            const data = currentTrack[i].data;
            const first = data[0];
            if (first >= 0x1 && first <= 0x7F) {
                curLength = first;
                if (data.length > 1) {
                    curLenRate = data[1] >> 4;
                    mml += `\nq${pad(data[1].toString(16), 2)} `;
                }
            } else if (first >= 0x80 && first <= 0xc7) {
                const bitDA = curDR * 0x10 + curAR;
                const bitSR = curSR * 0x20 + curRR;
                if (holdADSR) {
                    mml += `\n$ED ${trace8(bitDA)} ${trace8(bitSR)}\n`;
                    holdADSR = false;
                }
                if (holdRMC) {
                    const rmc = `$ED ${trace8(bitDA)} ${trace8(bitSR)}`;
                    mml += `\n(!${getRMC(rmc) + 1}, -1)\n`;
                    holdRMC = false;
                }
                privOctave = curOctave;
                curOctave = Math.floor((first - 0x80) / 12) + 1;
                curNote = (first - 0x80) % 12;
                if (privOctave !== curOctave) {
                    mml += `o${curOctave} `;
                }
                let length = '';
                if (amkFix && curLenRate >= 7) {
                    length = `=${curLength - 1} r=1`;
                } else {
                    length = (192 % curLength === 0) ? 192 / curLength : `=${curLength}`;
                }
                mml += `${notes[curNote]}${length} `;
            } else if (first === 0xC8 || first === 0xC9) {
                const length = (192 % curLength === 0) ? 192 / curLength : `=${curLength}`;
                mml += `${first === 0xC8 ? '^' : 'r'}${length} `;
            } else if ((first >= 0xca && first <= 0xdf) || (first >= 0xfa && first <= 0xfe)) {
                mml += `\n; ${printableBuffer(data)} \n`;
            } else if (first >= 0xe0 && first <= 0xf9) {
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
                        mml += `t${data[1]} `;
                        break;
                    }
                    case 0xED: {
                        mml += `v${data[1]} `;
                        break;
                    }
                    default: {
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
                        const bitDA = curDR * 0x10 + curAR;
                        const bitSR = curSR * 0x20 + data[2];
                        const rmc = `$ED ${trace8(bitDA)} ${trace8(bitSR)}`;
                        mml += `\n(!${getRMC(rmc) + 1}, 3)\n`;
                        break;
                    }
                    case 0x0F: {
                        mml += `y${curPan},${data[2]},${data[3]} `;
                        break;
                    }
                    default: {
                        if (mml[mml.length - 1] !== '\n') {
                            mml += '\n';
                        }
                        mml += `; Extended VCMD: ${printableBuffer(data)} \n`;
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
        mml = `(!${i + 1})[${rmcs[i]}]\n${mml}`;
    }
    return {
        mml, usedInst, brrChunks,
    };
};

module.exports = convAMK;
