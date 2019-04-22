const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs-extra');
const path = require('path');

if (argv._.length < 1 || argv.h || argv.help) {
    console.log('usage: hect2mml.js spc_file [--instptr val] [--trackptr val] [--printparsed] [--amkfix] [--doubletick times] [--brrnamemap map_file]');
    process.exit(1);
}

const offset = 0x100;
const instPtr = typeof argv.instptr === 'undefined' ? 0x2100 : Number(argv.instptr);
const trackPtr = typeof argv.trackptr === 'undefined' ? 0x2200 : Number(argv.trackptr);
const spcPath = path.resolve(process.cwd(), argv._[0]);
const spc = fs.readFileSync(spcPath);
const brrNameMap = argv.brrnamemap ? fs.readJSONSync(argv.brrnamemap, { encoding: 'utf8' }) : {};
const { trackData, mentionedAddr } = require('./lib/parser')(spc, offset, argv.printparsed, trackPtr);
const mml = require('./lib/conv_amk')(spc, offset, trackData, mentionedAddr, instPtr, argv.amkfix, Math.floor(Number(argv.doubletick)));
require('./lib/finalize')(instPtr, trackPtr, spcPath, brrNameMap, mml, spc);
