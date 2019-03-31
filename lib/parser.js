/* eslint-disable no-continue */

const fs = require('fs-extra');
const path = require('path');
const { trace8, trace16 } = require('./hex_addr');
const ParseLogger = require('./parse_logger');
const printableBuffer = require('./print_buffer');

const vcmdLen = [
    2, 2, 3, 4, 1, 2, 3, 2, // $E0 - $E7
    3, 2, 2, 4, 1, 2, 3, 4, // $E8 - $EF
    2, 4, 4, 1, 2, 4, 1, 4, // $F0 - $F7
    4, 4, 2, 0, 0, 0, 0, //    $F8 - $FE
];

const vcmdExLen = [
    2, 2, 2, 2, 2, 3, 2, 3, // $FF $00 - $FF $07
    2, 3, 0, 0, 2, 0, 0, 3, // $FF $08 - $FF $0F
];

/**
 * @param {Buffer} chunk
 * @param {boolean} printParsed
 * @param {number} offset
 * @param {number} trackPtr
 */
const parse = (chunk, offset, printParsed, trackPtr) => {
    const parselogger = new ParseLogger();
    parselogger.stdout = printParsed;

    const songEntry = chunk.readInt16LE(trackPtr + offset);

    const trackEntry = [];
    const trackData = [];
    for (let i = 0; i < 8; i += 1) {
        trackEntry[i] = chunk.readInt16LE(songEntry + i * 2 + offset);
    }
    for (let i = 0; i < 8; i += 1) {
        parselogger.add('================================');
        parselogger.add(`Track ${i} (${trace16(trackEntry[i])}) sequence data`);
        parselogger.add('================================\n');
        const sequenceData = [];
        trackData[i] = {
            trackAddr: trackEntry[i],
            trackData: sequenceData,
        };
        if (trackEntry[i] === 0) {
            continue;
        }
        let cmdPtr = trackEntry[i] + offset;
        let beforeSub = null;
        let loopCount = null;
        let cont = true;
        while (cont && (chunk[cmdPtr] !== 0 || cmdPtr < trackEntry[i + 1])) {
            // console.log(cmdPtr);
            if (chunk[cmdPtr] >= 0x1 && chunk[cmdPtr] <= 0x7F) {
                //
                // 0x1 - 0x7F: Note Params
                //
                const data = [chunk[cmdPtr]];
                if (chunk[cmdPtr + 1] >= 0x1 && chunk[cmdPtr + 1] <= 0x7F) {
                    data.push(chunk[cmdPtr + 1]);
                    cmdPtr += 1;
                }
                sequenceData.push({ addr: cmdPtr - offset, data });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${printableBuffer(data)}`);
                cmdPtr += 1;
            } else if (chunk[cmdPtr] >= 0x80 && chunk[cmdPtr] <= 0xDF) {
                //
                // 0x80 - 0xDF: Notes, Tie, Rest, Percussion Note
                //
                sequenceData.push({ addr: cmdPtr - offset, data: [chunk[cmdPtr]] });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${trace8(chunk[cmdPtr])}`);
                cmdPtr += 1;
            } else if (chunk[cmdPtr] >= 0xE0 && chunk[cmdPtr] <= 0xFE) {
                //
                // 0xE0 - 0xFE: Standard VCMDs
                //
                const data = [];
                const step = vcmdLen[chunk[cmdPtr] - 0xE0];
                if (step <= 0) {
                    console.error(`Warning: ${trace16(cmdPtr)} has unknown command ${trace8(chunk[cmdPtr])}`);
                    continue;
                }
                for (let j = 0; j < step; j += 1) {
                    data.push(chunk[cmdPtr]);
                    cmdPtr += 1;
                }
                sequenceData.push({ addr: cmdPtr - offset, data });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${printableBuffer(data)}`);
            } else if (chunk[cmdPtr] === 0xFF) {
                //
                // 0xFF: Extended VCMDs
                //
                const data = [];
                const step = vcmdExLen[chunk[cmdPtr + 1]] + 1;
                if (step <= 0) {
                    console.error(`Warning: ${trace16(cmdPtr)} has unknown sub command ${trace8(chunk[cmdPtr])}`);
                    continue;
                }
                for (let j = 0; j < step; j += 1) {
                    data.push(chunk[cmdPtr]);
                    cmdPtr += 1;
                }
                sequenceData.push({ addr: cmdPtr - offset, data });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${printableBuffer(data)}`);

                // 处理 可返回跳转 / 普通跳转
                switch (data[1]) {
                    case 0x5: {
                        beforeSub = cmdPtr;
                        cmdPtr = data[3] * 0x100 + data[2] + offset;
                        break;
                    }
                    case 0x6: {
                        if (beforeSub === null) {
                            throw Error(`Sequence data malformed on ${trace16(cmdPtr - offset)}`);
                        }
                        cmdPtr = beforeSub;
                        beforeSub = null;
                        break;
                    }
                    case 0x7: {
                        const target = data[3] * 0x100 + data[2] + offset;
                        if (target > cmdPtr) {
                            cmdPtr = target;
                        } else {
                            cont = false;
                        }
                        break;
                    }
                    case 0x8: {
                        if (loopCount === null) {
                            loopCount = data[2];
                        }
                        break;
                    }
                    case 0x9: {
                        if (loopCount > 1) {
                            loopCount -= 1;
                            cmdPtr = data[3] * 0x100 + data[2] + offset;
                        } else {
                            loopCount = null;
                        }
                        break;
                    }
                    default: {
                        break;
                    }
                }
            } else {
                throw Error(`Unknown situation ${chunk[cmdPtr]} on ${trace16(cmdPtr - offset)}`);
            }
        }
        parselogger.add('');
    }
    // const nowTime = new Date().getTime();
    fs.writeJSONSync(path.resolve(process.cwd(), 'result-0.json'), trackData, { encoding: 'utf8', spaces: 2 });
    parselogger.save(path.resolve(process.cwd(), 'result-0.log'));
    return trackData;
};

module.exports = parse;
