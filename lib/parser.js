const argv = require('minimist')(process.argv.slice(2));
const log4js = require('log4js');

/**
 * @param {Buffer} chunk
 * @param {number} offset
 * @param {number} instPtr
 * @param {number} trackPtr
 * @param {number} samplePtr
 */
const parse = (chunk, offset, instPtr, trackPtr, samplePtr) => {
    const logger = log4js.getLogger('Parser');
    logger.level = argv.trace || 'debug';
};

module.exports = parse;
