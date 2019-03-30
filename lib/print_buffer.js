const { trace8 } = require('./hex_addr');

const printableBuffer = (data) => {
    let str = '';
    for (let i = 0; i < data.length; i += 1) {
        str += `${trace8(data[i])} `;
    }
    return str.slice(0, -1);
};

module.exports = printableBuffer;
