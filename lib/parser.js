/* eslint-disable no-continue */

const fs = require('fs-extra');
const path = require('path');
const log4js = require('log4js');
const { trace8, trace16 } = require('./hex_addr');
const ParseLogger = require('./parse_logger');

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
 *
 * @param {number[]} data
 */
const printableBuffer = (data) => {
    let str = '';
    for (let i = 0; i < data.length; i += 1) {
        str += `${trace8(data[i])} `;
    }
    return str.slice(0, -1);
};

/**
 * @param {Buffer} chunk
 * @param {string} traceLevel
 * @param {boolean} printParsed
 * @param {number} offset
 * @param {number} instPtr
 * @param {number} trackPtr
 * @param {number} samplePtr
 */
const parse = (chunk, offset, traceLevel, printParsed, instPtr, trackPtr, samplePtr) => {
    const logger = log4js.getLogger('Parser');
    logger.level = traceLevel || 'debug';

    const parselogger = new ParseLogger();
    parselogger.stdout = printParsed;

    const songEntry = chunk.readInt16LE(trackPtr + offset);
    logger.debug(`Song Entry: ${trace16(songEntry)}`);

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
            logger.debug(`Track ${i} entry is ${trace16(trackEntry[i])}, ignoring`);
            continue;
        }
        let cmdPtr = trackEntry[i] + offset;
        let beforeSub = null;
        let cont = true;
        while (cont && (chunk[cmdPtr] !== 0 || cmdPtr < trackEntry[i + 1])) {
            if (chunk[cmdPtr] >= 0x1 && chunk[cmdPtr] <= 0x7F) {
                const data = [chunk[cmdPtr]];
                if (chunk[cmdPtr + 1] >= 0x1 && chunk[cmdPtr + 1] <= 0x7F) {
                    data.push(chunk[cmdPtr + 1]);
                    cmdPtr += 1;
                }
                sequenceData.push({ addr: cmdPtr - offset, data });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${printableBuffer(data)}`);
                cmdPtr += 1;
            } else if (chunk[cmdPtr] >= 0x80 && chunk[cmdPtr] <= 0xDF) {
                sequenceData.push({ addr: cmdPtr - offset, data: [chunk[cmdPtr]] });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${trace8(chunk[cmdPtr])}`);
                cmdPtr += 1;
            } else if (chunk[cmdPtr] >= 0xE0 && chunk[cmdPtr] <= 0xFE) {
                const data = [];
                const step = vcmdLen[chunk[cmdPtr] - 0xE0];
                if (step <= 0) {
                    logger.warn(`${trace16(cmdPtr)} has unknown command ${trace8(chunk[cmdPtr])}`);
                    continue;
                }
                for (let j = 0; j < step; j += 1) {
                    data.push(chunk[cmdPtr]);
                    cmdPtr += 1;
                }
                sequenceData.push({ addr: cmdPtr - offset, data });
                parselogger.add(`${trace16(cmdPtr - offset)}: ${printableBuffer(data)}`);
            } else if (chunk[cmdPtr] === 0xFF) {
                const data = [];
                const step = vcmdExLen[chunk[cmdPtr + 1]] + 1;
                if (step <= 0) {
                    logger.warn(`${trace16(cmdPtr)} has unknown sub command ${trace8(chunk[cmdPtr])}`);
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
    const nowTime = new Date().getTime();
    fs.writeJSONSync(path.resolve(process.cwd(), `result-${nowTime}.json`), trackData, { encoding: 'utf8', spaces: 2 });
    parselogger.save(path.resolve(process.cwd(), `result-${nowTime}.log`));
};

module.exports = parse;
