const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { trace8, pad } = require('./lib/hex_addr');

if (argv._.length < 1 || argv.h || argv.help) {
    console.log('usage: hect2mml.js [--instptr val] [--trackptr val] [--printparsed] [--amkfix] spc_file');
    process.exit(1);
}

const instPtr = typeof argv.instptr === 'undefined' ? 0x2100 : Number(argv.instptr);
const trackPtr = typeof argv.trackptr === 'undefined' ? 0x2200 : Number(argv.trackptr);
const offset = 0x100;

const spc = fs.readFileSync(argv._[0]);
const trackData = require('./lib/parser')(spc, offset, argv.printparsed, trackPtr);
const mml = require('./lib/conv_amk')(spc, offset, trackData, instPtr, argv.amkfix);

fs.mkdirpSync(path.resolve(process.cwd(), 'output/samples'));
const brrs = Object.entries(mml.brrChunks);
const brrNames = [];

let mmlStr = '';
mmlStr += '#amk 2\n#samples\n{\n\t#optimized\n';
brrs.forEach((e) => {
    const hash = crypto.createHash('sha256');
    hash.update(e[1]);
    const name = hash.digest('hex').slice(0, 16);
    brrNames[e[0]] = name;
    mmlStr += `\t"${name}.brr"\n`;
    fs.writeFileSync(path.resolve(process.cwd(), 'output/samples', `${name}.brr`), e[1]);
});

mmlStr += '}\n\n#instruments\n{\n';
mml.usedInst.forEach((e) => {
    const wantedPtr = instPtr + offset + e * 6;
    mmlStr += `\t"${brrNames[spc[wantedPtr]]}.brr"`;
    for (let i = 0; i < 5; i += 1) {
        mmlStr += ` ${trace8(spc[wantedPtr + 1 + i])}`;
    }
    mmlStr += '\n';
});
mmlStr += '}\n';
for (let i = 0; i < mml.usedInst.length; i += 1) {
    mmlStr += `"INSTX${pad(mml.usedInst[i].toString(16), 2)}=@${i + 30}"\n`;
}

mmlStr += mml.mml;

fs.writeFileSync(path.resolve(process.cwd(), 'output', 'song.txt'), mmlStr);
