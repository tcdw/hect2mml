const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs-extra');

if (argv._.length < 1 || argv.h || argv.help) {
    console.log('usage: hect2mml.js [--instptr val] [--trackptr val] [--sampleptr val] [--trace log4js_level] [--printparsed] spc_file');
}

const instPtr = typeof argv.instptr === 'undefined' ? 0x2100 : Number(argv.instptr);
const trackPtr = typeof argv.trackptr === 'undefined' ? 0x2200 : Number(argv.trackptr);
const samplePtr = typeof argv.sampleptr === 'undefined' ? 0x3000 : Number(argv.sampleptr);
const offset = 0x100;

const spc = fs.readFileSync(argv._[0]);
const trackData = require('./lib/parser')(spc, offset, argv.trace, argv.printparsed, instPtr, trackPtr);
const mml = require('./lib/conv_amk')(trackData);

console.log(mml);
