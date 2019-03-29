/* eslint-disable no-continue */

const log4js = require('log4js');
const { trace8, trace16 } = require('./hex_addr');

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
 * @param {string} traceLevel
 * @param {number} offset
 * @param {number} instPtr
 * @param {number} trackPtr
 * @param {number} samplePtr
 */
const parse = (chunk, offset, traceLevel, instPtr, trackPtr, samplePtr) => {
    const logger = log4js.getLogger('Parser');
    logger.level = traceLevel || 'debug';

    const songEntry = chunk.readInt16LE(trackPtr + offset);
    logger.debug(`Song Entry: ${trace16(songEntry)}`);

    const trackEntry = [];
    const trackData = [];
    for (let i = 0; i < 8; i += 1) {
        trackEntry[i] = chunk.readInt16LE(songEntry + i * 2 + offset);
        logger.debug(`Track ${i} Entry: ${trace16(trackEntry[i])}`);
    }
    for (let i = 0; i < 8; i += 1) {
        trackData[i] = [];
        if (trackEntry[i] === 0) {
            logger.debug(`Track ${i} entry is ${trace16(trackEntry[i])}, ignoring`);
            continue;
        }
        let cmdPtr = trackEntry[i] + offset;
        while (chunk[cmdPtr] !== 0 || cmdPtr < trackEntry[i + 1]) {
            if (chunk[cmdPtr] >= 0x1 && chunk[cmdPtr] <= 0x7F) {
                const data = [chunk[cmdPtr]];
                if (chunk[cmdPtr + 1] >= 0x1 && chunk[cmdPtr + 1] <= 0x7F) {
                    data.push(chunk[cmdPtr + 1]);
                    cmdPtr += 1;
                }
                trackData[i].push(data);
                cmdPtr += 1;
            } else if (chunk[cmdPtr] >= 0x80 && chunk[cmdPtr] <= 0xDF) {
                trackData[i].push([chunk[cmdPtr]]);
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
                trackData[i].push(data);
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
                trackData[i].push(data);
            } else {
                throw Error(`Unknown situation ${chunk[cmdPtr]} on ${trace16(cmdPtr)}`);
            }
        }
        console.log(trackData[i]);
    }
};

module.exports = parse;
