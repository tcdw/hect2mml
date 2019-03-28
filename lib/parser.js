/* eslint-disable no-continue */

const log4js = require('log4js');
const { trace8, trace16 } = require('./hex_addr');
const { cmdType } = require('./enum');

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
        let cmdPtr = trackEntry[i];
        while (chunk[cmdPtr] !== 0 || cmdPtr < trackEntry[i + 1]) {
            if (chunk[cmdPtr] >= 0x01 && chunk[cmdPtr] <= 0x7F) {
                const info = {
                    type: cmdType.NOTE_PARAMS,
                    length: chunk[cmdPtr],
                    durationRate: null,
                    velocityRate: null,
                };
                if (chunk[cmdPtr + 1] >= 0x01 && chunk[cmdPtr + 1] <= 0x7F) {
                    info.durationRate = Math.floor(chunk[cmdPtr + 1] / 0x10);
                    info.velocityRate = chunk[cmdPtr + 1] % 0x10;
                    cmdPtr += 1;
                }
                cmdPtr += 1;
                trackData[i].push(info);
                logger.debug(`Track ${i} - ${trace16(cmdPtr)}: Note Params`);
                break;
            }
            if (chunk[cmdPtr] >= 0x80 && chunk[cmdPtr] <= 0xC7) {
                const info = {
                    type: cmdType.NOTE,
                    note: chunk[cmdPtr] - 0x80,
                };
                cmdPtr += 1;
                trackData[i].push(info);
                logger.debug(`Track ${i} - ${trace16(cmdPtr)}: Note`);
                break;
            }
            if (chunk[cmdPtr] === 0xC8) {
                const info = {
                    type: cmdType.TIE,
                };
                cmdPtr += 1;
                trackData[i].push(info);
                logger.debug(`Track ${i} - ${trace16(cmdPtr)}: Tie`);
                break;
            }
            if (chunk[cmdPtr] === 0xC9) {
                const info = {
                    type: cmdType.REST,
                };
                cmdPtr += 1;
                trackData[i].push(info);
                logger.debug(`Track ${i} - ${trace16(cmdPtr)}: Rest`);
                break;
            }
            console.log('还没有实现呢！');
            console.log(trackData[i]);
            break;
        }
    }
};

module.exports = parse;
