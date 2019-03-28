const pad = (s, len) => {
    const str = String(s).toUpperCase();
    if (str.length >= len) {
        return str;
    }
    return '0'.repeat(len - str.length) + str;
};

const trace8 = num => `$${pad(num.toString(16), 2)}`;

const trace16 = num => `$${pad(num.toString(16), 4)}`;

module.exports = {
    pad, trace8, trace16,
};
