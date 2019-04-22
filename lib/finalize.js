const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { trace8, pad } = require('./hex_addr');

const finalize = (instPtr, trackPtr, spcPath, brrNameMap, mml, spc) => {
    const offset = 0x100;
    const spcName = path.parse(spcPath).name;
    const brrs = Object.entries(mml.brrChunks);
    const brrNames = [];

    let mmlStr = '';
    let patterns = '';
    mmlStr += '#amk 2\n';
    mmlStr += `#path "${spcName}"\n`;
    mmlStr += '#samples\n{\n\t#optimized\n';
    fs.mkdirpSync(path.resolve(process.cwd(), `${spcName}/${spcName}`));
    brrs.forEach((e) => {
        const hash = crypto.createHash('sha256');
        hash.update(e[1]);
        const brrChecksum = hash.digest('hex');
        const name = typeof brrNameMap[brrChecksum] === 'undefined' ? `h_${brrChecksum}` : brrNameMap[brrChecksum];
        brrNames[e[0]] = name;
        mmlStr += `\t"${name}.brr"\n`;
        fs.writeFileSync(path.resolve(process.cwd(), `${spcName}/${spcName}`, `${name}.brr`), e[1]);
    });

    mmlStr += '}\n#instruments\n{\n';
    mml.usedInst.forEach((e) => {
        const wantedPtr = instPtr + offset + e * 6;
        mmlStr += `\t"${brrNames[spc[wantedPtr]]}.brr"`;
        patterns += `"${brrNames[spc[wantedPtr]]}.brr"`;
        for (let i = 0; i < 5; i += 1) {
            mmlStr += ` ${trace8(spc[wantedPtr + 1 + i])}`;
            patterns += ` ${trace8(spc[wantedPtr + 1 + i])}`;
        }
        mmlStr += '\n';
        patterns += ' $A4 $40 $40\n';
    });
    mmlStr += '}\n#spc\n{';
    let spcAuthor = spc.toString('utf8', 0xB1, 0xD1);
    let spcGame = spc.toString('utf8', 0x4E, 0x6E);
    let spcTitle = spc.toString('utf8', 0x2E, 0x4E);
    if (spcAuthor.indexOf('\0') >= 0) {
        spcAuthor = spcAuthor.slice(0, spcAuthor.indexOf('\0'));
    }
    if (spcGame.indexOf('\0') >= 0) {
        spcGame = spcGame.slice(0, spcGame.indexOf('\0'));
    }
    if (spcTitle.indexOf('\0') >= 0) {
        spcTitle = spcTitle.slice(0, spcTitle.indexOf('\0'));
    }
    const now = new Date();
    mmlStr += `
\t#author    "${spcAuthor}"
\t#game      "${spcGame} / SMW"
\t#comment   "Ported with hect2mml (${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)})"
\t#title     "${spcTitle}"
}

`;
    for (let i = 0; i < mml.usedInst.length; i += 1) {
        mmlStr += `"INSTX${pad(mml.usedInst[i].toString(16), 2)}=@${i + 30}"\n`;
    }
    mmlStr += mml.mml;
    fs.writeFileSync(path.resolve(process.cwd(), spcName, `${spcGame} - ${spcTitle}.txt`), mmlStr);
    fs.writeFileSync(path.resolve(process.cwd(), `${spcName}/${spcName}`, '!patterns.txt'), patterns);
};

module.exports = finalize;
