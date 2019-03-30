const fs = require('fs-extra');

class ParseLogger {
    constructor() {
        this.content = '';
        this.stdout = true;
    }

    add(str) {
        this.content += `${str}\n`;
        if (this.stdout) {
            console.log(str);
        }
        return str;
    }

    save(pos) {
        fs.writeFileSync(pos, this.content, { encoding: 'utf8' });
    }
}

module.exports = ParseLogger;
