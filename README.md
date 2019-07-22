# hect2mml

Convert sequence data of **Hourai Gakuen no Bouken!: Tenkousei Scramble** to Addmusic MML.

## Usage

1. Get [Node.js](https://nodejs.org)
2. Get this repo by using GitHub's "Clone or download -> Download ZIP", then unzip it.
3. Put the SPC you want to get the sequence data into the directory of this project.
3. Open terminal, change the directory to the directory. If you using Windows, you can simply execute the `cd-here.cmd` file.
4. Run command:

```bash
./hect2mml.js yourspcnamehere.spc
```

and then, you will get a directory with the name of your SPC file. The new directory contains all necessary files and can be inserted with AddmusicK.

## Advanced Usage

`hect2mml.js` provides various options, and you can use like that:

```bash
./hect2mml.js spc_name [options...]
```

### `--barebones`

Only output notes, volume changes and tempo from the SPC.

### `--doubletick times`

Make all of notes X times longer. eg. `--doubletick 2` will make all of notes 2 times longer, like:

```none
e8 e16 e24 => e4 e8 e12
```

## `--amkfix`

Usually you do not need that; For AddmusicM/K, just add `$F4 $02` at the beginning of MML and setting correct loop points.

## `--printparsed`

Print the parsed binary date to stdout.

## `--instptr [val]`

Usually you do not need that; It's for setting instrument list pointer manually.

## `--trackptr [val]`

Usually you do not need that; It's for setting track pointer manually.