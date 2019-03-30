const { pad, trace8, trace16 } = require('./hex_addr');
const printableBuffer = require('./print_buffer');

const equalCmds = [
    [0xda], [0xdb], [0xdc], [0xde], [0xdf], [0xe0], [0xe1], [0xe2],
    [0xe3], [0xe4], [0xfa, 0x02], [0xe5], [0xe5, 0x00, 0x00, 0x00], [0xe7], [0xe8], [0xe9],
    [0xea], [0xeb], [0xec], [0xeb, 0x00, 0x00, 0x00], [0xee], [0xef], [0xf0], [0xf1],
    [0xf2], [0xdd],
];
const notes = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];

const convAMK = (ast) => {
    let mml = '';
    const usedInst = [];
    for (let channel = 0; channel < ast.length; channel += 1) {
        mml += `#${channel}\n`;
        const currentTrack = ast[channel].trackData;
        let privOctave = 0;
        let curLength = 0;
        let curOctave = 0;
        let curNote = 0;
        for (let i = 0; i < currentTrack.length; i += 1) {
            const data = currentTrack[i].data;
            const first = data[0];
            if (first >= 0x1 && first <= 0x7F) {
                curLength = first;
                if (data.length > 1) {
                    mml += `q${pad(data[1].toString(16), 2)} `;
                }
            } else if (first >= 0x80 && first <= 0xc7) {
                privOctave = curOctave;
                curOctave = Math.floor((first - 0x80) / 12) + 1;
                curNote = (first - 0x80) % 12;
                if (privOctave !== curOctave) {
                    mml += `o${curOctave} `;
                }
                mml += `${notes[curNote]}${(192 % curLength === 0) ? 192 / curLength : `=${curLength}`} `;
            } else if (first === 0xC8 || first === 0xC9) {
                mml += `${first === 0xC8 ? '^' : 'r'}${(192 % curLength === 0) ? 192 / curLength : `=${curLength}`} `;
            } else if ((first >= 0xca && first <= 0xdf) || (first >= 0xfa && first <= 0xfe)) {
                mml += `\n; ${printableBuffer(data)} \n`;
            } else if (first >= 0xe0 && first <= 0xf9) {
                switch (first) {
                    case 0xE0: {
                        if (usedInst.indexOf(data[1]) < 0) {
                            usedInst.push(data[1]);
                        }
                        mml += `\nINSTX${pad(data[1].toString(16), 2)} `;
                        break;
                    }
                    case 0xE1: {
                        if (data[1] <= 20) {
                            mml += `y${data[1]} `;
                        } else {
                            if (mml[mml.length - 1] !== '\n') {
                                mml += '\n';
                            }
                            mml += `${printableBuffer(equalCmds[0x1])} ${printableBuffer(data.slice(1))} `;
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
            }
        }
        mml += '\n\n';
    }
    usedInst.sort();
    return { mml, usedInst };
};

module.exports = convAMK;
